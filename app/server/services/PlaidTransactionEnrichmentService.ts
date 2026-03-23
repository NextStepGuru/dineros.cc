import type { Category, PrismaClient } from "@prisma/client";
import type { Transaction } from "plaid";
import { z } from "zod";
import env from "~/server/env";
import { prisma as defaultPrisma } from "~/server/clients/prismaClient";
import { getOpenAIClient } from "~/server/clients/openaiClient";
import { loggedChatCompletion } from "~/server/services/OpenAiCompletionLogger";

const enrichmentResponseSchema = z.object({
  displayName: z.string(),
  categoryId: z.uuid().nullable(),
});

const MAX_DESC = 1500;

/** Prefer `merchant_name` / `original_description` over deprecated `name`. */
export function transactionDisplayLabel(tx: Transaction): string {
  const merchant = tx.merchant_name?.trim();
  if (merchant) return merchant;
  const original = tx.original_description?.trim();
  if (original) return original;
  return "";
}

export function buildCategoryPaths(categories: Category[]): Map<string, string> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  function pathFor(id: string): string {
    const parts: string[] = [];
    let cur: Category | undefined = byId.get(id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.name);
      cur = cur.subCategoryId ? byId.get(cur.subCategoryId) : undefined;
    }
    return parts.join(" / ");
  }
  const map = new Map<string, string>();
  for (const c of categories) {
    map.set(c.id, pathFor(c.id));
  }
  return map;
}

export type PlaidEnrichmentMetadata = {
  userId: number | null;
  accountRegisterId: number;
  accountId: string;
  plaidTransactionId: string;
};

class PlaidTransactionEnrichmentService {
  db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  async enrich(params: {
    transaction: Transaction;
    accountRegisterId: number;
    accountId: string;
    context: PlaidEnrichmentMetadata;
  }): Promise<{ description: string; categoryId: string | null }> {
    const { transaction, accountId, context } = params;
    const fallbackName = transactionDisplayLabel(transaction) || "Transaction";

    const client = getOpenAIClient();
    if (!client || !env?.OPENAI_API_KEY?.trim()) {
      return { description: fallbackName, categoryId: null };
    }

    if (!accountId?.trim()) {
      return { description: fallbackName, categoryId: null };
    }

    let categories: Category[] = [];
    try {
      const rows = await this.db.category.findMany({
        where: { accountId, isArchived: false },
      });
      categories = Array.isArray(rows) ? rows : [];
    } catch {
      return { description: fallbackName, categoryId: null };
    }

    const paths = buildCategoryPaths(categories);
    const categoryLines = [...categories]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `${c.id} — ${paths.get(c.id) ?? c.name}`)
      .join("\n");

    const allowedIds = new Set(categories.map((c) => c.id));

    const payload: Record<string, unknown> = {
      amount: transaction.amount,
      date: transaction.date,
    };
    const label = transactionDisplayLabel(transaction);
    if (label) {
      payload.display_label = label;
    }
    if (transaction.merchant_name) {
      payload.merchant_name = transaction.merchant_name;
    }
    if (transaction.original_description) {
      payload.original_description = transaction.original_description;
    }
    if (transaction.personal_finance_category) {
      payload.personal_finance_category = transaction.personal_finance_category;
    }

    const model = env?.OPENAI_PLAID_TX_MODEL ?? "gpt-5-nano";

    const userMsg = `Plaid transaction (JSON):\n${JSON.stringify(payload, null, 2)}\n\nAllowed categories (uuid — path):\n${categoryLines || "(none — use null for categoryId)"}`;

    try {
      const completion = await loggedChatCompletion({
        client,
        purpose: "plaid_transaction_enrichment",
        metadata: {
          userId: context.userId,
          accountRegisterId: context.accountRegisterId,
          accountId: context.accountId,
          plaidTransactionId: context.plaidTransactionId,
        },
        body: {
          model,
          messages: [
            {
              role: "system",
              content:
                "You classify bank transactions for a personal finance app. Reply with a single JSON object only, no markdown. Keys: displayName (short human-readable merchant or description) and categoryId (exactly one of the listed UUID strings, or null if none fit).",
            },
            { role: "user", content: userMsg },
          ],
          response_format: { type: "json_object" },
        },
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        return { description: fallbackName, categoryId: null };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { description: fallbackName, categoryId: null };
      }

      const res = enrichmentResponseSchema.safeParse(parsed);
      if (!res.success) {
        return { description: fallbackName, categoryId: null };
      }

      let description = res.data.displayName.trim() || fallbackName;
      if (description.length > MAX_DESC) {
        description = description.slice(0, MAX_DESC);
      }

      const cat = res.data.categoryId;
      const categoryId = cat && allowedIds.has(cat) ? cat : null;

      return { description, categoryId };
    } catch {
      return { description: fallbackName, categoryId: null };
    }
  }
}

export default PlaidTransactionEnrichmentService;
