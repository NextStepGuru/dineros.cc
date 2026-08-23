import type {
  AccountRegister,
  AccountType,
  Category,
  PrismaClient,
  RegisterEntry,
  Reoccurrence,
} from "@prisma/client";
import type { Transaction } from "plaid";
import { z } from "zod";
import env from "~/server/env";
import { prisma as defaultPrisma } from "~/server/clients/prismaClient";
import { getOpenAIClient } from "~/server/clients/openaiClient";
import { loggedChatCompletion } from "~/server/services/OpenAiCompletionLogger";
import {
  buildCategoryPaths,
  transactionDisplayLabel,
} from "~/server/services/PlaidTransactionEnrichmentService";
import { dateTimeService } from "~/server/services/forecast/DateTimeService";

const BATCH_SIZE = 25;
const CANDIDATE_DAY_RANGE = 14;
const MAX_DESC = 1500;
const RECENT_ENTRY_SAMPLE = 20;

const aiMatchItemSchema = z.object({
  plaidTransactionId: z.string(),
  entryId: z.string().nullable(),
  reoccurrenceId: z.number().int().nullable(),
  confidence: z.number().min(0).max(1),
  displayName: z.string(),
  categoryId: z.string().uuid().nullable(),
});

const aiMatchBatchResponseSchema = z.object({
  matches: z.array(aiMatchItemSchema),
});

export type PlaidAiMatchSuggestion = {
  plaidTransactionId: string;
  entryId: string | null;
  reoccurrenceId: number | null;
  confidence: number;
  displayName: string;
  categoryId: string | null;
};

export type PlaidAiMatchContext = {
  userId: number | null;
  accountRegisterId: number;
  accountId: string;
};

function formatRegisterAmount(
  transaction: Transaction,
  accountType: AccountType,
): number {
  return accountType.isCredit ? transaction.amount : transaction.amount * -1;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function minConfidence(): number {
  const raw = env?.OPENAI_PLAID_MATCH_MIN_CONFIDENCE;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0.7;
}

function matchModel(): string {
  return (
    env?.OPENAI_PLAID_MATCH_MODEL?.trim() ||
    env?.OPENAI_PLAID_TX_MODEL?.trim() ||
    "gpt-5-nano"
  );
}

class PlaidTransactionMatchAiService {
  db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  async matchBatch(params: {
    transactions: Transaction[];
    accountRegister: AccountRegister;
    accountType: AccountType;
    context: PlaidAiMatchContext;
  }): Promise<Map<string, PlaidAiMatchSuggestion>> {
    const { transactions, accountRegister, accountType, context } = params;
    const results = new Map<string, PlaidAiMatchSuggestion>();
    if (transactions.length === 0) return results;

    const client = getOpenAIClient();
    if (!client || !env?.OPENAI_API_KEY?.trim()) return results;

    const accountId = accountRegister.accountId?.trim();
    if (!accountId) return results;

    let categories: Category[];
    try {
      categories = await this.db.category.findMany({
        where: { accountId, isArchived: false },
      });
    } catch {
      return results;
    }

    const recurrences = await this.db.reoccurrence.findMany({
      where: { accountRegisterId: accountRegister.id },
      include: {
        plaidNameAliases: { select: { normalizedName: true } },
        billProfile: {
          select: {
            expectedAmountLow: true,
            expectedAmountHigh: true,
          },
        },
      },
    });

    const allowedCategoryIds = new Set(categories.map((c) => c.id));
    const categoryPaths = buildCategoryPaths(categories);
    const categoryLines = [...categories]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `${c.id} — ${categoryPaths.get(c.id) ?? c.name}`)
      .join("\n");

    for (const batch of chunk(transactions, BATCH_SIZE)) {
      const candidateEntries = await this.loadCandidateEntries(
        accountRegister.id,
        batch,
      );
      const recentEntries = await this.loadRecentCategorizedEntries(
        accountRegister.id,
      );

      const batchResults = await this.callModel({
        client,
        transactions: batch,
        accountType,
        categoryLines,
        allowedCategoryIds,
        candidateEntries,
        recurrences,
        recentEntries,
        context,
      });

      for (const [id, suggestion] of batchResults) {
        results.set(id, suggestion);
      }
    }

    return results;
  }

  private async loadCandidateEntries(
    accountRegisterId: number,
    transactions: Transaction[],
  ): Promise<RegisterEntry[]> {
    if (transactions.length === 0) return [];

    let minDate = dateTimeService.parseInput(transactions[0]!.date);
    let maxDate = minDate;
    for (const tx of transactions) {
      const dt = dateTimeService.parseInput(tx.date);
      if (dt.isBefore(minDate)) minDate = dt;
      if (dt.isAfter(maxDate)) maxDate = dt;
    }

    const daysBefore = dateTimeService
      .subtract(CANDIDATE_DAY_RANGE, "day", minDate)
      .toDate();
    const daysAfter = dateTimeService
      .add(CANDIDATE_DAY_RANGE, "day", maxDate)
      .toDate();

    return this.db.registerEntry.findMany({
      where: {
        accountRegisterId,
        plaidId: null,
        isBalanceEntry: false,
        createdAt: {
          gte: daysBefore,
          lte: daysAfter,
        },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
  }

  private async loadRecentCategorizedEntries(
    accountRegisterId: number,
  ): Promise<RegisterEntry[]> {
    return this.db.registerEntry.findMany({
      where: {
        accountRegisterId,
        categoryId: { not: null },
        isBalanceEntry: false,
      },
      orderBy: { createdAt: "desc" },
      take: RECENT_ENTRY_SAMPLE,
    });
  }

  private buildTransactionPayload(
    transaction: Transaction,
    accountType: AccountType,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      plaidTransactionId: transaction.transaction_id,
      amount: formatRegisterAmount(transaction, accountType),
      date: transaction.date,
    };
    if (transaction.name) payload.name = transaction.name;
    const label = transactionDisplayLabel(transaction);
    if (label) payload.display_label = label;
    if (transaction.merchant_name) payload.merchant_name = transaction.merchant_name;
    if (transaction.original_description) {
      payload.original_description = transaction.original_description;
    }
    if (transaction.personal_finance_category) {
      payload.personal_finance_category = transaction.personal_finance_category;
    }
    return payload;
  }

  private buildCandidateLines(entries: RegisterEntry[]): string {
    if (entries.length === 0) return "(none)";
    return entries
      .map((e) =>
        JSON.stringify({
          entryId: e.id,
          date: e.createdAt.toISOString().slice(0, 10),
          amount: Number(e.amount),
          description: e.description,
          reoccurrenceId: e.reoccurrenceId,
          isProjected: e.isProjected,
        }),
      )
      .join("\n");
  }

  private buildRecurrenceLines(
    recurrences: Array<
      Reoccurrence & {
        plaidNameAliases: { normalizedName: string }[];
        billProfile: {
          expectedAmountLow: unknown;
          expectedAmountHigh: unknown;
        } | null;
      }
    >,
  ): string {
    if (recurrences.length === 0) return "(none)";
    return recurrences
      .map((r) =>
        JSON.stringify({
          reoccurrenceId: r.id,
          description: r.description,
          amount: Number(r.amount),
          aliases: r.plaidNameAliases.map((a) => a.normalizedName),
          expectedAmountLow:
            r.billProfile?.expectedAmountLow != null
              ? Number(r.billProfile.expectedAmountLow)
              : null,
          expectedAmountHigh:
            r.billProfile?.expectedAmountHigh != null
              ? Number(r.billProfile.expectedAmountHigh)
              : null,
          categoryId: r.categoryId,
        }),
      )
      .join("\n");
  }

  private buildRecentEntryLines(entries: RegisterEntry[]): string {
    if (entries.length === 0) return "(none)";
    return entries
      .map((e) =>
        JSON.stringify({
          description: e.description,
          amount: Number(e.amount),
          categoryId: e.categoryId,
        }),
      )
      .join("\n");
  }

  private async callModel(params: {
    client: NonNullable<ReturnType<typeof getOpenAIClient>>;
    transactions: Transaction[];
    accountType: AccountType;
    categoryLines: string;
    allowedCategoryIds: Set<string>;
    candidateEntries: RegisterEntry[];
    recurrences: Array<
      Reoccurrence & {
        plaidNameAliases: { normalizedName: string }[];
        billProfile: {
          expectedAmountLow: unknown;
          expectedAmountHigh: unknown;
        } | null;
      }
    >;
    recentEntries: RegisterEntry[];
    context: PlaidAiMatchContext;
  }): Promise<Map<string, PlaidAiMatchSuggestion>> {
    const {
      client,
      transactions,
      accountType,
      categoryLines,
      allowedCategoryIds,
      candidateEntries,
      recurrences,
      recentEntries,
      context,
    } = params;

    const out = new Map<string, PlaidAiMatchSuggestion>();
    const minConf = minConfidence();

    const txnLines = transactions
      .map((tx) => JSON.stringify(this.buildTransactionPayload(tx, accountType)))
      .join("\n");

    const userMsg = [
      "Unmatched Plaid transactions (one JSON object per line):",
      txnLines,
      "",
      "Candidate register lines (entryId — may merge bank import onto these):",
      this.buildCandidateLines(candidateEntries),
      "",
      "Recurrences for this register (reoccurrenceId — use when no entryId fits):",
      this.buildRecurrenceLines(recurrences),
      "",
      "Recent categorized entries on this register (few-shot):",
      this.buildRecentEntryLines(recentEntries),
      "",
      "Allowed categories (uuid — path):",
      categoryLines || "(none — use null for categoryId)",
      "",
      `Minimum confidence to match: ${minConf}. Below that, leave entryId and reoccurrenceId null but still return displayName and categoryId.`,
    ].join("\n");

    try {
      const completion = await loggedChatCompletion({
        client,
        purpose: "plaid_transaction_match",
        metadata: {
          userId: context.userId,
          accountRegisterId: context.accountRegisterId,
          accountId: context.accountId,
          transactionCount: transactions.length,
        },
        body: {
          model: matchModel(),
          messages: [
            {
              role: "system",
              content:
                "You match bank transactions to forecast/register lines in a personal finance app. Reply with a single JSON object only, no markdown. Shape: { \"matches\": [ { \"plaidTransactionId\", \"entryId\" (string or null), \"reoccurrenceId\" (number or null), \"confidence\" (0-1), \"displayName\", \"categoryId\" (uuid or null) } ] }. Rules: each plaidTransactionId appears once; use at most one of entryId or reoccurrenceId; never assign the same entryId to two transactions; prefer projected forecast lines when amounts differ slightly; variable bills may not match exact amounts; pick the best categoryId from the list when reasonable.",
            },
            { role: "user", content: userMsg },
          ],
          response_format: { type: "json_object" },
        },
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) return out;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return out;
      }

      const res = aiMatchBatchResponseSchema.safeParse(parsed);
      if (!res.success) return out;

      const usedEntryIds = new Set<string>();
      const allowedTxnIds = new Set(
        transactions.map((t) => t.transaction_id),
      );

      for (const item of res.data.matches) {
        if (!allowedTxnIds.has(item.plaidTransactionId)) continue;
        if (item.confidence < minConf) {
          out.set(item.plaidTransactionId, {
            plaidTransactionId: item.plaidTransactionId,
            entryId: null,
            reoccurrenceId: null,
            confidence: item.confidence,
            displayName: this.trimDisplayName(
              item.displayName,
              transactions.find((t) => t.transaction_id === item.plaidTransactionId),
            ),
            categoryId:
              item.categoryId && allowedCategoryIds.has(item.categoryId)
                ? item.categoryId
                : null,
          });
          continue;
        }

        let entryId = item.entryId;
        if (entryId && usedEntryIds.has(entryId)) {
          entryId = null;
        }
        if (entryId) {
          const exists = candidateEntries.some((e) => e.id === entryId);
          if (!exists) entryId = null;
        }
        if (entryId) usedEntryIds.add(entryId);

        let reoccurrenceId = item.reoccurrenceId;
        if (entryId) reoccurrenceId = null;
        if (reoccurrenceId != null) {
          const exists = recurrences.some((r) => r.id === reoccurrenceId);
          if (!exists) reoccurrenceId = null;
        }

        out.set(item.plaidTransactionId, {
          plaidTransactionId: item.plaidTransactionId,
          entryId,
          reoccurrenceId,
          confidence: item.confidence,
          displayName: this.trimDisplayName(
            item.displayName,
            transactions.find((t) => t.transaction_id === item.plaidTransactionId),
          ),
          categoryId:
            item.categoryId && allowedCategoryIds.has(item.categoryId)
              ? item.categoryId
              : null,
        });
      }
    } catch {
      return out;
    }

    return out;
  }

  private trimDisplayName(
    displayName: string,
    transaction: Transaction | undefined,
  ): string {
    const fallback =
      (transaction ? transactionDisplayLabel(transaction) : "") ||
      "Transaction";
    let description = displayName.trim() || fallback;
    if (description.length > MAX_DESC) {
      description = description.slice(0, MAX_DESC);
    }
    return description;
  }
}

export default PlaidTransactionMatchAiService;
