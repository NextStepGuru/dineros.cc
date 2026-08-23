import type {
  Category,
  MerchantCategoryRule,
  PrismaClient,
} from "@prisma/client";
import type { Transaction } from "plaid";
import { z } from "zod";
import env from "~/server/env";
import { prisma as defaultPrisma } from "~/server/clients/prismaClient";
import { getOpenAIClient } from "~/server/clients/openaiClient";
import { loggedChatCompletion } from "~/server/services/OpenAiCompletionLogger";
import { buildCategoryPaths } from "~/server/lib/categoryPaths";
import { transactionDisplayLabel } from "~/server/lib/plaidTransactionLabel";
import type { CategorySource, MerchantApplyMode } from "~/server/lib/merchantCategoryKey";
import {
  merchantEntityIdFromPlaid,
  merchantNameFromPlaid,
  normalizeMerchantKey,
} from "~/server/lib/merchantCategoryKey";
import {
  isHighPfcConfidence,
  pathForPfcDetailed,
} from "~/server/lib/plaidPfcCategoryMap";

const MAX_DESC = 1500;
const LLM_BATCH_SIZE = 25;

const singlePathSchema = z.object({
  displayName: z.string().optional(),
  categoryPath: z.string().nullable(),
});

const batchPathSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      displayName: z.string().optional(),
      categoryPath: z.string().nullable(),
    }),
  ),
});

export type ClassifyResult = {
  description: string;
  categoryId: string | null;
  source: CategorySource | null;
};

export type ClassifyContext = {
  userId: number | null;
  accountRegisterId: number;
  accountId: string;
  plaidTransactionId?: string;
};

type PathIndex = {
  byPath: Map<string, string>;
  byPathLower: Map<string, string>;
  byLeafLower: Map<string, string[]>;
};

const FUEL_BRAND_FRAGMENTS = [
  "shell",
  "chevron",
  "exxon",
  "mobil",
  "marathon",
  "sunoco",
  "valero",
  "phillips 66",
  "circle k",
  "circlek",
  "wawa",
  "sheetz",
  "racetrac",
  "quiktrip",
  "arco",
  "sinclair",
  "citgo",
  "speedway",
  "pilot",
  "flying j",
  "love's",
  "loves travel",
  "buc-ee",
  "costco gas",
  "sam's club gas",
  "murphy usa",
  "ampm",
  "maverik",
  "casey's",
  "kum & go",
];

const CONVENIENCE_FRAGMENTS = [
  "7-eleven",
  "7 eleven",
  "circle k",
  "circlek",
  "wawa",
  "sheetz",
  "racetrac",
  "quiktrip",
  "thorntons",
];

const UTILITY_GAS_FRAGMENTS = [
  "natural gas",
  "gas bill",
  "gas utility",
  "washington gas",
  "pg&e",
  "dominion energy",
  "national grid",
  "nstar",
  "xcel energy",
  "atmos energy",
  "nicor",
  "columbia gas",
  "enbridge",
  "so cal gas",
  "socalgas",
  "peoples gas",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clipDescription(value: string, fallback: string): string {
  const next = (value.trim() || fallback).trim() || fallback;
  return next.length > MAX_DESC ? next.slice(0, MAX_DESC) : next;
}

function classifyModel(): string {
  return env?.OPENAI_PLAID_TX_MODEL?.trim() || "gpt-5-mini";
}

function buildPathIndex(paths: Map<string, string>): PathIndex {
  const byPath = new Map<string, string>();
  const byPathLower = new Map<string, string>();
  const byLeafLower = new Map<string, string[]>();
  for (const [id, path] of paths) {
    byPath.set(path, id);
    byPathLower.set(path.toLowerCase(), id);
    const leaf = path.split(" / ").pop()?.toLowerCase();
    if (leaf) {
      const list = byLeafLower.get(leaf) ?? [];
      list.push(id);
      byLeafLower.set(leaf, list);
    }
  }
  return { byPath, byPathLower, byLeafLower };
}

function resolvePathToId(index: PathIndex, rawPath: string | null): string | null {
  if (!rawPath?.trim()) return null;
  const trimmed = rawPath
    .trim()
    .replaceAll(" › ", " / ")
    .replaceAll(" > ", " / ");
  const exact = index.byPath.get(trimmed);
  if (exact) return exact;
  const ci = index.byPathLower.get(trimmed.toLowerCase());
  if (ci) return ci;
  const leaf = trimmed.split(" / ").pop()?.trim().toLowerCase();
  if (!leaf) return null;
  const ids = index.byLeafLower.get(leaf);
  if (ids?.length === 1) return ids[0] ?? null;
  return null;
}

function pathForCategoryId(paths: Map<string, string>, categoryId: string): string | null {
  for (const [id, path] of paths) {
    if (id === categoryId) return path;
  }
  return null;
}

function pfcOf(tx: Transaction): { detailed: string | null; confidence: string | null } {
  const pfc = tx.personal_finance_category as
    | { detailed?: string; confidence_level?: string }
    | null
    | undefined;
  return {
    detailed: pfc?.detailed ?? null,
    confidence: pfc?.confidence_level ?? null,
  };
}

function searchText(tx: Transaction): string {
  const blob = tx as unknown as Record<string, unknown>;
  return [
    tx.merchant_name,
    tx.original_description,
    tx.name,
    merchantNameFromPlaid(blob),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function absAmount(tx: Transaction): number {
  const n = Number(tx.amount);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

export function transactionFromPlaidJson(json: unknown): Transaction | null {
  const record = asRecord(json);
  if (!record) return null;
  if (typeof record.amount !== "number" && typeof record.transaction_id !== "string") {
    return null;
  }
  return record as unknown as Transaction;
}

class TransactionCategorizationService {
  db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  async classify(params: {
    transaction: Transaction;
    accountId: string;
    context: ClassifyContext;
    updateDescription?: boolean;
    purpose?: string;
  }): Promise<ClassifyResult> {
    const fallback = transactionDisplayLabel(params.transaction) || "Transaction";
    const [row] = await this.classifyMany({
      items: [
        {
          id: params.context.plaidTransactionId ?? "tx",
          transaction: params.transaction,
        },
      ],
      accountId: params.accountId,
      context: params.context,
      updateDescription: params.updateDescription,
      purpose: params.purpose,
    });
    return row ?? { description: fallback, categoryId: null, source: null };
  }

  async classifyMany(params: {
    items: Array<{ id: string; transaction: Transaction }>;
    accountId: string;
    context: ClassifyContext;
    updateDescription?: boolean;
    purpose?: string;
  }): Promise<ClassifyResult[]> {
    const { items, accountId } = params;
    const updateDescription = params.updateDescription !== false;
    const fallbacks = items.map(
      (item) => transactionDisplayLabel(item.transaction) || "Transaction",
    );
    if (items.length === 0) return [];
    if (!accountId.trim()) {
      return fallbacks.map((description) => ({
        description,
        categoryId: null,
        source: null,
      }));
    }

    let categories: Category[];
    try {
      categories = await this.db.category.findMany({
        where: { accountId, isArchived: false },
      });
    } catch {
      return fallbacks.map((description) => ({
        description,
        categoryId: null,
        source: null,
      }));
    }

    const paths = buildCategoryPaths(categories);
    const index = buildPathIndex(paths);
    let rules: MerchantCategoryRule[] = [];
    try {
      rules = await this.db.merchantCategoryRule.findMany({ where: { accountId } });
    } catch {
      rules = [];
    }

    const out: ClassifyResult[] = fallbacks.map((description) => ({
      description,
      categoryId: null,
      source: null,
    }));
    const llmItems: Array<{ offset: number; transaction: Transaction }> = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      const decided = this.classifyWithoutLlm({
        transaction: item.transaction,
        fallbackName: fallbacks[i] ?? "Transaction",
        index,
        rules,
        updateDescription,
      });
      if (decided) out[i] = decided;
      else llmItems.push({ offset: i, transaction: item.transaction });
    }

    if (llmItems.length > 0) {
      const llmMap = await this.classifyWithLlm({
        llmItems,
        paths,
        index,
        rules,
        fallbacks,
        context: params.context,
        purpose: params.purpose ?? "plaid_transaction_enrichment",
        updateDescription,
      });
      for (const [offset, result] of llmMap) {
        out[offset] = result;
      }
    }

    return out;
  }

  /**
   * Reclassify unlocked Plaid-sourced register entries for an account.
   * Does not change amounts or descriptions. Skips `categoryLocked` rows.
   */
  async recategorizeUnlockedPlaidEntries(params: {
    accountId: string;
    accountRegisterId?: number;
    userId: number | null;
  }): Promise<{ updated: number; skippedLocked: number }> {
    const registerFilter = {
      accountId: params.accountId,
      ...(params.accountRegisterId ? { id: params.accountRegisterId } : {}),
    };

    const skippedLocked = await this.db.registerEntry.count({
      where: {
        categoryLocked: true,
        plaidJson: { not: null },
        isBalanceEntry: false,
        register: registerFilter,
      },
    });

    const entries = await this.db.registerEntry.findMany({
      where: {
        categoryLocked: false,
        plaidJson: { not: null },
        isBalanceEntry: false,
        register: registerFilter,
      },
      select: {
        id: true,
        categoryId: true,
        plaidJson: true,
        accountRegisterId: true,
      },
    });

    let updated = 0;
    const byRegister = new Map<number, typeof entries>();
    for (const entry of entries) {
      const list = byRegister.get(entry.accountRegisterId) ?? [];
      list.push(entry);
      byRegister.set(entry.accountRegisterId, list);
    }

    for (const [accountRegisterId, registerEntries] of byRegister) {
      const items: Array<{
        id: string;
        entryId: string;
        categoryId: string | null;
        transaction: Transaction;
      }> = [];
      for (const entry of registerEntries) {
        const transaction = transactionFromPlaidJson(entry.plaidJson);
        if (!transaction) continue;
        items.push({
          id: entry.id,
          entryId: entry.id,
          categoryId: entry.categoryId,
          transaction,
        });
      }

      for (let start = 0; start < items.length; start += LLM_BATCH_SIZE) {
        const batch = items.slice(start, start + LLM_BATCH_SIZE);
        const results = await this.classifyMany({
          items: batch.map((row) => ({
            id: row.id,
            transaction: row.transaction,
          })),
          accountId: params.accountId,
          context: {
            userId: params.userId,
            accountRegisterId,
            accountId: params.accountId,
            plaidTransactionId: batch[0]?.transaction.transaction_id,
          },
          updateDescription: false,
          purpose: "register_entry_recategorize",
        });

        for (let i = 0; i < batch.length; i++) {
          const row = batch[i];
          const result = results[i];
          if (!row || !result?.categoryId) continue;
          if (result.categoryId === row.categoryId) continue;
          await this.db.registerEntry.update({
            where: { id: row.entryId },
            data: {
              categoryId: result.categoryId,
              categorySource: result.source ?? "ai",
            },
          });
          updated += 1;
        }
      }
    }

    return { updated, skippedLocked };
  }

  /**
   * Load recent user-locked category paths for merchants in this LLM batch.
   * Keys off Plaid JSON merchant fields, never encrypted descriptions.
   */
  private async loadUserLockHintLines(params: {
    accountId: string;
    merchantKeys: Set<string>;
    paths: Map<string, string>;
  }): Promise<string> {
    if (!params.accountId.trim() || params.merchantKeys.size === 0) return "";
    const rows = await this.db.registerEntry.findMany({
      where: {
        categoryLocked: true,
        categorySource: "user",
        plaidJson: { not: null },
        categoryId: { not: null },
        register: { accountId: params.accountId },
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
      select: { plaidJson: true, categoryId: true },
    });
    const lines: string[] = [];
    for (const row of rows) {
      const rec = asRecord(row.plaidJson);
      const name = merchantNameFromPlaid(rec);
      const key = name ? normalizeMerchantKey(name) : "";
      if (!key || !params.merchantKeys.has(key)) continue;
      const path = row.categoryId
        ? pathForCategoryId(params.paths, row.categoryId)
        : null;
      if (!path) continue;
      lines.push(`USER ${key} → ${path}`);
      if (lines.length >= 12) break;
    }
    return lines.join("\n");
  }

  private classifyWithoutLlm(params: {
    transaction: Transaction;
    fallbackName: string;
    index: PathIndex;
    rules: MerchantCategoryRule[];
    updateDescription: boolean;
  }): ClassifyResult | null {
    const { transaction, fallbackName, index, rules, updateDescription } =
      params;
    const blob = transaction as unknown as Record<string, unknown>;
    const merchantName = merchantNameFromPlaid(blob);
    const merchantKey = merchantName ? normalizeMerchantKey(merchantName) : "";
    const entityId = merchantEntityIdFromPlaid(blob);
    const description = updateDescription
      ? clipDescription(merchantName || fallbackName, fallbackName)
      : fallbackName;

    const always = this.findRule(rules, merchantKey, entityId, "ALWAYS");
    if (always) {
      return { description, categoryId: always.categoryId, source: "rule" };
    }

    // HINT is few-shot only (personal vs work Shell). Skip deterministic apply.
    if (this.findRule(rules, merchantKey, entityId, "HINT")) {
      return null;
    }

    const heuristicPath = this.heuristicNaturePath(transaction);
    if (heuristicPath) {
      const categoryId = resolvePathToId(index, heuristicPath);
      if (categoryId) {
        return { description, categoryId, source: "rule" };
      }
    }

    const pfc = pfcOf(transaction);
    if (isHighPfcConfidence(pfc.confidence)) {
      const naturePath = pathForPfcDetailed(pfc.detailed);
      if (naturePath) {
        const categoryId = resolvePathToId(index, naturePath);
        if (categoryId) {
          return { description, categoryId, source: "pfc" };
        }
      }
    }

    return null;
  }

  private findRule(
    rules: MerchantCategoryRule[],
    merchantKey: string,
    entityId: string | null,
    mode: MerchantApplyMode,
  ): MerchantCategoryRule | undefined {
    return rules.find((rule) => {
      if (rule.applyMode !== mode) return false;
      if (entityId && rule.merchantEntityId && rule.merchantEntityId === entityId) {
        return true;
      }
      return merchantKey.length > 0 && rule.merchantKey === merchantKey;
    });
  }

  private heuristicNaturePath(transaction: Transaction): string | null {
    const text = searchText(transaction);
    const amount = absAmount(transaction);
    const pfc = pfcOf(transaction);
    const detailed = pfc.detailed?.toUpperCase() ?? "";

    if (UTILITY_GAS_FRAGMENTS.some((frag) => text.includes(frag))) {
      return "Utilities / Natural Gas";
    }
    if (detailed === "RENT_AND_UTILITIES_GAS") {
      return "Utilities / Natural Gas";
    }

    if (text.includes("costco") && (text.includes("gas") || text.includes("fuel"))) {
      return "Transportation / Fuel";
    }
    if (text.includes(" bp") || text.startsWith("bp ") || text.includes(" bp ")) {
      return "Transportation / Fuel";
    }
    if (FUEL_BRAND_FRAGMENTS.some((frag) => text.includes(frag))) {
      return "Transportation / Fuel";
    }
    if (
      detailed === "TRANSPORTATION_GAS" ||
      detailed.includes("GAS_STATION")
    ) {
      return "Transportation / Fuel";
    }
    const legacyCats = (transaction.category ?? []).join(" ").toLowerCase();
    if (legacyCats.includes("gas station")) {
      return "Transportation / Fuel";
    }

    if (CONVENIENCE_FRAGMENTS.some((frag) => text.includes(frag))) {
      if (amount >= 20) return "Transportation / Fuel";
      if (amount > 0 && amount < 8) return "Food & Dining / Coffee & Snacks";
    }

    return null;
  }

  private plaidPayload(transaction: Transaction): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      amount: transaction.amount,
      date: transaction.date,
      pending: transaction.pending === true,
    };
    const label = transactionDisplayLabel(transaction);
    if (label) payload.display_label = label;
    if (transaction.merchant_name) payload.merchant_name = transaction.merchant_name;
    if (transaction.original_description) {
      payload.original_description = transaction.original_description;
    }
    if (transaction.name) payload.name = transaction.name;
    if (transaction.payment_channel) {
      payload.payment_channel = transaction.payment_channel;
    }
    if (transaction.personal_finance_category) {
      payload.personal_finance_category = transaction.personal_finance_category;
    }
    const website = (transaction as { website?: string | null }).website;
    if (website) payload.website = website;
    const counterparties = (transaction as { counterparties?: unknown }).counterparties;
    if (counterparties) payload.counterparties = counterparties;
    return payload;
  }

  private systemPrompt(
    allowedPaths: string[],
    hintLines: string,
    userLockLines = "",
  ): string {
    return [
      "You classify bank transactions for a personal finance app.",
      "Reply with JSON only, no markdown.",
      "Pick exactly one categoryPath from the allowed list (Parent / Child).",
      "Prefer a leaf. Use a parent only when no child fits.",
      "Never return null when any leaf is a reasonable fit.",
      "Gas-station brands and TRANSPORTATION_GAS map to Transportation / Fuel, or Business / Fuel when hints say the merchant is work-related.",
      "Utility natural-gas bills map to Utilities / Natural Gas, never Fuel.",
      "Work meals, work fuel, SaaS, and work travel use Business children when hints or merchant indicate business purpose.",
      "Personal restaurants stay under Food & Dining.",
      `Allowed categoryPath values:\n${allowedPaths.join("\n") || "(none)"}`,
      hintLines ? `Account merchant hints:\n${hintLines}` : "",
      userLockLines ? `Recent user-locked examples for these merchants:\n${userLockLines}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private async classifyWithLlm(params: {
    llmItems: Array<{ offset: number; transaction: Transaction }>;
    paths: Map<string, string>;
    index: PathIndex;
    rules: MerchantCategoryRule[];
    fallbacks: string[];
    context: ClassifyContext;
    purpose: string;
    updateDescription: boolean;
  }): Promise<Map<number, ClassifyResult>> {
    const results = new Map<number, ClassifyResult>();
    const client = getOpenAIClient();
    if (!client || !env?.OPENAI_API_KEY?.trim()) return results;

    const allowedPaths = [...new Set(params.paths.values())].sort((a, b) =>
      a.localeCompare(b),
    );
    const hintLines = params.rules
      .slice(0, 40)
      .map((rule) => {
        const path = pathForCategoryId(params.paths, rule.categoryId) ?? rule.categoryId;
        return `${rule.applyMode} ${rule.merchantKey} → ${path}`;
      })
      .join("\n");

    const merchantKeys = new Set<string>();
    for (const row of params.llmItems) {
      const blob = row.transaction as unknown as Record<string, unknown>;
      const name = merchantNameFromPlaid(blob);
      const key = name ? normalizeMerchantKey(name) : "";
      if (key) merchantKeys.add(key);
    }
    const userLockLines = await this.loadUserLockHintLines({
      accountId: params.context.accountId,
      merchantKeys,
      paths: params.paths,
    });

    const model = classifyModel();

    for (let start = 0; start < params.llmItems.length; start += LLM_BATCH_SIZE) {
      const batch = params.llmItems.slice(start, start + LLM_BATCH_SIZE);
      const isSingle = batch.length === 1;
      const userPayload = isSingle
        ? JSON.stringify(this.plaidPayload(batch[0]!.transaction), null, 2)
        : JSON.stringify(
            batch.map((row) => ({
              id: String(row.offset),
              transaction: this.plaidPayload(row.transaction),
            })),
            null,
            2,
          );

      const userContent = isSingle
        ? `Plaid transaction (JSON):\n${userPayload}\n\nReturn JSON keys: displayName, categoryPath.`
        : `Plaid transactions (JSON array):\n${userPayload}\n\nReturn JSON: {"results":[{"id":"<offset>","displayName":"...","categoryPath":"Parent / Child"}]}`;

      try {
        const completion = await loggedChatCompletion({
          client,
          purpose: params.purpose,
          metadata: {
            userId: params.context.userId,
            accountRegisterId: params.context.accountRegisterId,
            accountId: params.context.accountId,
            plaidTransactionId: params.context.plaidTransactionId ?? null,
            batchSize: batch.length,
          },
          body: {
            model,
            messages: [
              {
                role: "system",
                content: this.systemPrompt(allowedPaths, hintLines, userLockLines),
              },
              { role: "user", content: userContent },
            ],
            response_format: { type: "json_object" },
          },
        });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }

        if (isSingle) {
          const row = batch[0]!;
          const parsedRow = singlePathSchema.safeParse(parsed);
          if (!parsedRow.success) continue;
          const fallback = params.fallbacks[row.offset] ?? "Transaction";
          const description = params.updateDescription
            ? clipDescription(parsedRow.data.displayName ?? fallback, fallback)
            : fallback;
          results.set(row.offset, {
            description,
            categoryId: resolvePathToId(params.index, parsedRow.data.categoryPath),
            source: "ai",
          });
          continue;
        }

        const parsedBatch = batchPathSchema.safeParse(parsed);
        if (!parsedBatch.success) continue;
        const byId = new Map(parsedBatch.data.results.map((r) => [r.id, r]));
        for (const row of batch) {
          const hit = byId.get(String(row.offset));
          const fallback = params.fallbacks[row.offset] ?? "Transaction";
          if (!hit) continue;
          const description = params.updateDescription
            ? clipDescription(hit.displayName ?? fallback, fallback)
            : fallback;
          results.set(row.offset, {
            description,
            categoryId: resolvePathToId(params.index, hit.categoryPath),
            source: "ai",
          });
        }
      } catch {
        // Leave unclassified; caller keeps fallback description.
      }
    }

    return results;
  }
}

export default TransactionCategorizationService;
