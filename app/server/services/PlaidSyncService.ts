import type {
  AccountRegister,
  AccountType,
  PrismaClient,
} from "@prisma/client";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { AccountBase, Transaction } from "plaid";
import { PlaidApi } from "plaid";
import { configuration } from "../lib/getPlaidClient";
import { createId as cuid } from "@paralleldrive/cuid2";
import { log } from "~/server/logger";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { dateTimeService } from "./forecast/DateTimeService";
import TransactionMatchingService from "./TransactionMatchingService";
import PlaidTransactionEnrichmentService from "./PlaidTransactionEnrichmentService";
import PlaidTransactionMatchAiService, {
  type PlaidAiMatchSuggestion,
} from "./PlaidTransactionMatchAiService";
import env from "~/server/env";
import {
  sendPlaidSyncSummaryEmail,
  type RegisterSyncStatsRow,
} from "./PlaidSyncNotificationService";
import {
  extractPlaidErrorInfo,
  isPlaidCredentialClassError,
} from "~/server/lib/plaidApiError";
import { notifyIntegrationAlert } from "~/server/services/integrationOpsAlert";
import { markPlaidItemReauthRequired } from "~/server/services/plaidReauthService";
import { resolvePlaidAccessTokenFromStored } from "~/server/lib/plaidAccessTokenCrypto";
import { recordPlaidSyncLog } from "~/server/lib/recordPlaidSyncLog";

const DAYS_REQUESTED = 3;

type PlaidBalanceRegister = {
  id: number;
  plaidId: string | null;
  type: { isCredit: boolean };
};

/**
 * Ledger snapshot from Plaid. Prefer `current` (posted) over `available` (holds)
 * so the stored register balance moves with posted transactions.
 */
function signedPlaidRegisterBalance(
  account: AccountBase,
  isCredit: boolean,
): number | null {
  const raw = isCredit
    ? account.balances.current
    : (account.balances.current ?? account.balances.available);
  if (raw == null) return null;
  const n = Number.parseFloat(raw.toString());
  if (!Number.isFinite(n)) return null;
  return isCredit ? n * -1 : n;
}

/** Posted Plaid txn may include the `transaction_id` of the pending txn it replaced. */
function pendingTransactionIdIfPosted(tx: Transaction): string | null {
  if (tx.pending === true) return null;
  const raw = (tx as { pending_transaction_id?: string | null })
    .pending_transaction_id;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** Prefer `merchant_name` / `original_description` over deprecated `name`. */
function transactionDisplayLabel(tx: Transaction): string {
  const merchant = tx.merchant_name?.trim();
  if (merchant) return merchant;
  const original = tx.original_description?.trim();
  if (original) return original;
  return "";
}

interface SyncResult {
  newTransactions: number;
  matchedTransactions: number;
  totalProcessed: number;
  errors: string[];
  byRegister: RegisterSyncStatsRow[];
  ownerUserId: number | null;
  /** Raw transaction count returned from Plaid (legacy `transactionsGet`). */
  fetchedTransactionCount: number;
}

class PlaidSyncService {
  db: PrismaClient;
  client: PlaidApi;
  transactionMatcher: TransactionMatchingService;
  plaidEnrichment: PlaidTransactionEnrichmentService;
  plaidMatchAi: PlaidTransactionMatchAiService;

  constructor(db: PrismaClient = PrismaDb as PrismaClient) {
    this.db = db;
    this.client = new PlaidApi(configuration);
    this.transactionMatcher = new TransactionMatchingService(db);
    this.plaidEnrichment = new PlaidTransactionEnrichmentService(db);
    this.plaidMatchAi = new PlaidTransactionMatchAiService(db);
  }

  private async maybeAlertPlaidCredentialError(
    err: unknown,
    context: Record<string, unknown>,
  ): Promise<void> {
    const info = extractPlaidErrorInfo(err);
    if (!isPlaidCredentialClassError(info)) return;

    const itemId =
      typeof context.itemId === "string" && context.itemId.length > 0
        ? context.itemId
        : null;
    if (itemId) {
      await markPlaidItemReauthRequired({
        itemId,
        reason: info.errorCode ?? "CREDENTIAL_ERROR",
      });
    }

    await notifyIntegrationAlert({
      source: "plaid",
      kind: "credential",
      message: info.message,
      httpStatus: info.httpStatus,
      details: {
        ...context,
        errorCode: info.errorCode,
        errorType: info.errorType,
      },
      dedupeKey: `plaid:credential:${info.errorCode ?? String(info.httpStatus ?? "unknown")}`,
    });
  }

  /**
   * Formats transaction data based on account register type.
   * Pending: Plaid `transaction.pending === true` (bank hold / not yet posted).
   * Posted: `pending === false` or omitted; align with `register_entry.isPending`.
   */
  private formatTransactionData(
    transaction: Transaction,
    accountRegister: AccountRegister,
    accountType: AccountType,
  ) {
    let formattedAmount = transaction.amount;
    if (!accountType.isCredit) {
      formattedAmount = transaction.amount * -1;
    }

    const formattedName = transactionDisplayLabel(transaction);

    return {
      id: cuid(),
      plaidId: transaction.transaction_id,
      plaidJson: structuredClone(transaction),
      accountRegisterId: accountRegister.id,
      amount: formattedAmount,
      balance: 0,
      createdAt: dateTimeService.toDate(
        dateTimeService.parseInput(transaction.date),
      ),
      description: formattedName,
      isProjected: false,
      isPending: transaction.pending === true,
      hasBalanceReCalc: true,
    };
  }

  private async recategorizeUnlockedPlaidEntry(params: {
    entry: { id: string; categoryId: string | null; categoryLocked?: boolean };
    transaction: Transaction;
    accountRegister: AccountRegister;
    userId: number | null;
  }): Promise<void> {
    if (params.entry.categoryLocked) return;
    const result = await this.plaidEnrichment.enrich({
      transaction: params.transaction,
      accountRegisterId: params.accountRegister.id,
      accountId: params.accountRegister.accountId,
      context: {
        userId: params.userId,
        accountRegisterId: params.accountRegister.id,
        accountId: params.accountRegister.accountId,
        plaidTransactionId: params.transaction.transaction_id,
      },
      updateDescription: false,
    });
    if (!result.categoryId || result.categoryId === params.entry.categoryId) {
      return;
    }
    await this.db.registerEntry.update({
      where: { id: params.entry.id },
      data: {
        categoryId: result.categoryId,
        categorySource: result.categorySource ?? "ai",
      },
    });
  }

  private async buildTransactionDataForCreateWithAiSuggestion(
    transaction: Transaction,
    accountRegister: AccountRegister & { type: AccountType },
    enrichmentUserId: number | null,
    suggestion?: PlaidAiMatchSuggestion,
  ) {
    if (suggestion) {
      const classified = await this.buildTransactionDataForCreate(
        transaction,
        accountRegister,
        enrichmentUserId,
      );
      return {
        ...classified,
        description: suggestion.displayName || classified.description,
      };
    }
    return this.buildTransactionDataForCreate(
      transaction,
      accountRegister,
      enrichmentUserId,
    );
  }

  private async tryDeterministicPlaidMatch(
    transaction: Transaction,
    accountRegister: AccountRegister & { type: AccountType },
    enrichmentUserId: number | null = null,
  ): Promise<"skip" | "matched" | "unmatched"> {
    const matchResult = await this.transactionMatcher.matchTransaction(
      transaction,
      accountRegister,
      accountRegister.type,
    );

    if (matchResult.matchType === "skip") {
      log({
        message: `Skipping existing Plaid transaction: ${transactionDisplayLabel(transaction)}`,
        data: {
          transactionId: transaction.transaction_id,
          accountRegisterId: accountRegister.id,
        },
        level: "debug",
      });
      return "skip";
    }

    if (
      matchResult.isMatched &&
      matchResult.existingEntry &&
      matchResult.matchType !== "none"
    ) {
      await this.transactionMatcher.updateExistingTransaction(
        matchResult.existingEntry,
        transaction,
        matchResult.matchType,
        accountRegister.type,
      );
      await this.recategorizeUnlockedPlaidEntry({
        entry: matchResult.existingEntry,
        transaction,
        accountRegister,
        userId: enrichmentUserId,
      });
      log({
        message: `Matched existing transaction: ${transactionDisplayLabel(transaction)}`,
        data: {
          transactionId: transaction.transaction_id,
          matchType: matchResult.matchType,
          accountRegisterId: accountRegister.id,
        },
        level: "info",
      });
      return "matched";
    }

    return "unmatched";
  }

  private async applyAiMatchSuggestion(
    transaction: Transaction,
    accountRegister: AccountRegister & { type: AccountType },
    suggestion: PlaidAiMatchSuggestion | undefined,
    enrichmentUserId: number | null,
  ): Promise<{ newDelta: number; matchedDelta: number }> {
    const minConf = env?.OPENAI_PLAID_MATCH_MIN_CONFIDENCE ?? 0.7;

    if (
      suggestion &&
      suggestion.confidence >= minConf &&
      suggestion.entryId
    ) {
      const entry = await this.db.registerEntry.findFirst({
        where: {
          id: suggestion.entryId,
          accountRegisterId: accountRegister.id,
        },
      });
      if (entry) {
        await this.transactionMatcher.updateExistingTransaction(
          entry,
          transaction,
          "ai",
          accountRegister.type,
        );
        if (entry.reoccurrenceId != null) {
          await this.transactionMatcher.upsertPlaidNameAliasesForReoccurrence(
            accountRegister.id,
            entry.reoccurrenceId,
            [transaction],
          );
        }
        await this.recategorizeUnlockedPlaidEntry({
          entry,
          transaction,
          accountRegister,
          userId: enrichmentUserId,
        });
        log({
          message: `AI matched transaction to entry: ${transactionDisplayLabel(transaction)}`,
          data: {
            transactionId: transaction.transaction_id,
            entryId: entry.id,
            confidence: suggestion.confidence,
            accountRegisterId: accountRegister.id,
          },
          level: "info",
        });
        return { newDelta: 0, matchedDelta: 1 };
      }
    }

    if (
      suggestion &&
      suggestion.confidence >= minConf &&
      suggestion.reoccurrenceId != null
    ) {
      const reoccurrence = await this.db.reoccurrence.findFirst({
        where: {
          id: suggestion.reoccurrenceId,
          accountRegisterId: accountRegister.id,
        },
      });
      if (reoccurrence) {
        const linked =
          await this.transactionMatcher.findReoccurrenceEntryForLink(
            transaction,
            accountRegister.id,
            suggestion.reoccurrenceId,
          );
        if (linked) {
          await this.transactionMatcher.updateExistingTransaction(
            linked,
            transaction,
            "ai",
            accountRegister.type,
          );
          await this.db.registerEntry.update({
            where: { id: linked.id },
            data: { reoccurrenceId: suggestion.reoccurrenceId },
          });
          await this.recategorizeUnlockedPlaidEntry({
            entry: linked,
            transaction,
            accountRegister,
            userId: enrichmentUserId,
          });
        } else {
          const base = this.formatTransactionData(
            transaction,
            accountRegister,
            accountRegister.type,
          );
          const categoryId =
            suggestion.categoryId ?? reoccurrence.categoryId ?? undefined;
          await this.transactionMatcher.createNewTransaction(
            transaction,
            accountRegister,
            accountRegister.type,
            {
              ...base,
              description: reoccurrence.description ?? suggestion.displayName,
              reoccurrenceId: suggestion.reoccurrenceId,
              categoryLocked: false,
              ...(categoryId
                ? { categoryId, categorySource: "recurrence" }
                : {}),
            },
          );
        }
        await this.transactionMatcher.upsertPlaidNameAliasesForReoccurrence(
          accountRegister.id,
          suggestion.reoccurrenceId,
          [transaction],
        );
        log({
          message: `AI matched transaction to recurrence: ${transactionDisplayLabel(transaction)}`,
          data: {
            transactionId: transaction.transaction_id,
            reoccurrenceId: suggestion.reoccurrenceId,
            confidence: suggestion.confidence,
            accountRegisterId: accountRegister.id,
          },
          level: "info",
        });
        return linked
          ? { newDelta: 0, matchedDelta: 1 }
          : { newDelta: 1, matchedDelta: 0 };
      }
    }

    const transactionData =
      await this.buildTransactionDataForCreateWithAiSuggestion(
        transaction,
        accountRegister,
        enrichmentUserId,
        suggestion,
      );
    await this.transactionMatcher.createNewTransaction(
      transaction,
      accountRegister,
      accountRegister.type,
      transactionData,
    );
    return { newDelta: 1, matchedDelta: 0 };
  }

  private async processUnmatchedTransactionsWithAi(
    unmatched: Transaction[],
    accountRegister: AccountRegister & { type: AccountType },
    enrichmentUserId: number | null,
  ): Promise<{ newCount: number; matchedCount: number }> {
    if (unmatched.length === 0) {
      return { newCount: 0, matchedCount: 0 };
    }

    const aiResults = await this.plaidMatchAi.matchBatch({
      transactions: unmatched,
      accountRegister,
      accountType: accountRegister.type,
      context: {
        userId: enrichmentUserId,
        accountRegisterId: accountRegister.id,
        accountId: accountRegister.accountId,
      },
    });

    let newCount = 0;
    let matchedCount = 0;
    for (const transaction of unmatched) {
      const suggestion = aiResults.get(transaction.transaction_id);
      const { newDelta, matchedDelta } = await this.applyAiMatchSuggestion(
        transaction,
        accountRegister,
        suggestion,
        enrichmentUserId,
      );
      newCount += newDelta;
      matchedCount += matchedDelta;
    }
    return { newCount, matchedCount };
  }

  private async buildTransactionDataForCreate(
    transaction: Transaction,
    accountRegister: AccountRegister & { type: AccountType },
    enrichmentUserId: number | null,
  ) {
    const base = this.formatTransactionData(
      transaction,
      accountRegister,
      accountRegister.type,
    );
    const { description, categoryId, categorySource } = await this.plaidEnrichment.enrich({
      transaction,
      accountRegisterId: accountRegister.id,
      accountId: accountRegister.accountId,
      context: {
        userId: enrichmentUserId,
        accountRegisterId: accountRegister.id,
        accountId: accountRegister.accountId,
        plaidTransactionId: transaction.transaction_id,
      },
    });
    return {
      ...base,
      description,
      categoryLocked: false,
      ...(categoryId
        ? { categoryId, categorySource: categorySource ?? "ai" }
        : {}),
    };
  }

  private shouldSkipSupersededPendingPlaidTxn(
    transaction: Transaction,
    pendingIdsSuperseded: Set<string>,
  ): boolean {
    return (
      transaction.pending === true &&
      pendingIdsSuperseded.has(transaction.transaction_id)
    );
  }

  /** @returns true if the posted→pending path handled the transaction (caller should continue). */
  private async tryPlaidPostedPendingUpdateInPlace(
    transaction: Transaction,
    accountRegister: AccountRegister & { type: AccountType },
    enrichmentUserId: number | null = null,
  ): Promise<boolean> {
    const postedPendingId = pendingTransactionIdIfPosted(transaction);
    if (!postedPendingId) return false;
    const existingPendingRow = await this.db.registerEntry.findFirst({
      where: {
        accountRegisterId: accountRegister.id,
        plaidId: postedPendingId,
      },
    });
    if (existingPendingRow) {
      await this.transactionMatcher.updateExistingTransaction(
        existingPendingRow,
        transaction,
        "exact",
        accountRegister.type,
      );
      await this.recategorizeUnlockedPlaidEntry({
        entry: existingPendingRow,
        transaction,
        accountRegister,
        userId: enrichmentUserId,
      });
      log({
        message: "Plaid pending→posted: updated register entry in place",
        data: {
          accountRegisterId: accountRegister.id,
          pendingTransactionId: postedPendingId,
          postedTransactionId: transaction.transaction_id,
        },
        level: "info",
      });
      return true;
    }
    log({
      message:
        "Plaid pending→posted: no existing row for pending_transaction_id, using normal match",
      data: {
        accountRegisterId: accountRegister.id,
        pendingTransactionId: postedPendingId,
        postedTransactionId: transaction.transaction_id,
      },
      level: "debug",
    });
    return false;
  }

  private async syncTransactionsForAccount(
    accountRegister: AccountRegister & { type: AccountType },
    transactions: Transaction[],
    userIdByAccountId: Map<string, number> = new Map(),
  ): Promise<{ newCount: number; matchedCount: number; errors: string[] }> {
    let newCount = 0;
    let matchedCount = 0;
    const errors: string[] = [];
    const unmatched: Transaction[] = [];

    const pendingIdsSuperseded = new Set<string>();
    for (const t of transactions) {
      const pid = pendingTransactionIdIfPosted(t);
      if (pid) pendingIdsSuperseded.add(pid);
    }

    const enrichmentUserId =
      userIdByAccountId.get(accountRegister.accountId) ?? null;

    for (const transaction of transactions) {
      try {
        if (
          this.shouldSkipSupersededPendingPlaidTxn(
            transaction,
            pendingIdsSuperseded,
          )
        ) {
          log({
            message:
              "Skipping superseded pending Plaid transaction (posted in same batch)",
            data: {
              transactionId: transaction.transaction_id,
              accountRegisterId: accountRegister.id,
            },
            level: "debug",
          });
          continue;
        }

        if (
          await this.tryPlaidPostedPendingUpdateInPlace(
            transaction,
            accountRegister,
            enrichmentUserId,
          )
        ) {
          matchedCount++;
          continue;
        }

        const outcome = await this.tryDeterministicPlaidMatch(
          transaction,
          accountRegister,
          enrichmentUserId,
        );
        if (outcome === "skip") continue;
        if (outcome === "matched") {
          matchedCount++;
          continue;
        }
        unmatched.push(transaction);
      } catch (error) {
        const errorMsg = `Failed to process transaction ${transaction.transaction_id}: ${error}`;
        errors.push(errorMsg);
        log({
          message: errorMsg,
          data: { error },
          level: "error",
        });
      }
    }

    if (unmatched.length > 0) {
      try {
        const aiResult = await this.processUnmatchedTransactionsWithAi(
          unmatched,
          accountRegister,
          enrichmentUserId,
        );
        newCount += aiResult.newCount;
        matchedCount += aiResult.matchedCount;
      } catch (error) {
        const errorMsg = `Failed AI match batch for register ${accountRegister.id}: ${error}`;
        errors.push(errorMsg);
        log({
          message: errorMsg,
          data: { error },
          level: "error",
        });
      }
    }

    return { newCount, matchedCount, errors };
  }

  /**
   * Load Plaid-linked registers for a token. Equality on the encrypted token uses
   * the hash column; never use `plaidId: { in }` (unsupported on encrypted fields).
   */
  private async findPlaidRegistersByAccessToken(
    accessToken: string,
    plaidAccountIds?: string[],
  ): Promise<PlaidBalanceRegister[]> {
    const accountRegisters = await this.db.accountRegister.findMany({
      where: {
        plaidAccessToken: accessToken,
        plaidId: { not: null },
        isArchived: false,
      },
      select: {
        id: true,
        plaidId: true,
        type: { select: { isCredit: true } },
      },
    });
    if (!plaidAccountIds?.length) return accountRegisters;
    const requested = new Set(plaidAccountIds);
    return accountRegisters.filter(
      (r) => r.plaidId != null && requested.has(r.plaidId),
    );
  }

  private async applyPlaidBalancesToRegisters(
    accounts: AccountBase[],
    accountRegisters: PlaidBalanceRegister[],
  ): Promise<void> {
    const registerByPlaidId = new Map(
      accountRegisters
        .filter((r) => r.plaidId != null)
        .map((r) => [r.plaidId as string, r]),
    );
    const now = dateTimeService.nowDate();
    let updated = 0;

    for (const account of accounts) {
      const accountRegister = registerByPlaidId.get(account.account_id);
      if (!accountRegister) continue;

      const latestBalance = signedPlaidRegisterBalance(
        account,
        accountRegister.type.isCredit,
      );
      if (latestBalance == null) {
        log({
          message: "Skipping Plaid balance update: no numeric balance",
          data: { accountRegisterId: accountRegister.id },
          level: "warn",
        });
        continue;
      }

      await this.db.accountRegister.update({
        where: { id: accountRegister.id },
        data: {
          balance: latestBalance,
          latestBalance,
          plaidBalanceLastSyncAt: now,
        },
      });
      updated += 1;
    }

    log({
      message: "Applied Plaid account balances",
      data: {
        plaidAccounts: accounts.length,
        linkedRegisters: accountRegisters.length,
        updated,
      },
      level: "info",
    });
  }

  /**
   * Fetches Plaid account balances and writes them onto linked registers.
   */
  async getAllAccountsByAccessTokenAndUpdateBalance({
    accessToken,
    plaidAccountIds,
  }: {
    accessToken: string;
    plaidAccountIds: string[];
  }): Promise<AccountBase[]> {
    const accountRegisters = await this.findPlaidRegistersByAccessToken(
      accessToken,
      plaidAccountIds,
    );
    const linkedPlaidIds = accountRegisters
      .map((r) => r.plaidId)
      .filter((id): id is string => id != null);

    if (linkedPlaidIds.length === 0) {
      log({
        message: "No Plaid-linked registers for balance update",
        level: "info",
      });
      return [];
    }

    let accountsResponse;
    try {
      accountsResponse = await this.client.accountsGet({
        access_token: accessToken,
        options: { account_ids: linkedPlaidIds },
      });
    } catch (err) {
      await this.maybeAlertPlaidCredentialError(err, { path: "accountsGet" });
      throw err;
    }

    const accountList = accountsResponse.data.accounts;
    await this.applyPlaidBalancesToRegisters(accountList, accountRegisters);
    return accountList;
  }

  /** Best-effort: transaction sync should still succeed if balance pull fails. */
  private async syncBalancesForAccessToken(
    accessToken: string,
    plaidAccountIds: string[],
  ): Promise<void> {
    try {
      await this.getAllAccountsByAccessTokenAndUpdateBalance({
        accessToken,
        plaidAccountIds,
      });
    } catch (err) {
      log({
        message: "Plaid balance update after transaction sync failed",
        data: {
          error: err instanceof Error ? err.message : String(err),
          plaidAccountCount: plaidAccountIds.length,
        },
        level: "error",
      });
    }
  }

  /**
   * Gets transactions from Plaid API
   */
  async getTransactions({
    accessToken,
    plaidAccountIds,
    startDate,
    endDate,
  }: {
    accessToken: string;
    plaidAccountIds: string[];
    startDate: string;
    endDate: string;
  }): Promise<Transaction[]> {
    let transactions;
    try {
      transactions = await this.client.transactionsGet({
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
        options: {
          account_ids: plaidAccountIds,
          include_personal_finance_category: true,
          include_original_description: true,
        },
      });
    } catch (err) {
      await this.maybeAlertPlaidCredentialError(err, {
        path: "transactionsGet",
        startDate,
        endDate,
      });
      throw err;
    }

    return transactions.data.transactions;
  }

  /**
   * Syncs all transactions for multiple accounts
   */
  async syncAllTransactions({
    accessToken,
    plaidAccountIds,
    startDate,
    endDate,
  }: {
    accessToken: string;
    plaidAccountIds: string[];
    startDate: string;
    endDate: string;
  }): Promise<SyncResult> {
    const transactions = await this.getTransactions({
      accessToken,
      plaidAccountIds,
      startDate,
      endDate,
    });

    log({
      message: "Transactions fetched",
      data: {
        transactions: transactions.length,
        plaidAccountIds,
      },
      level: "info",
    });

    const accountRegisters = await this.db.accountRegister.findMany({
      where: {
        plaidAccessToken: accessToken,
      },
      include: {
        type: true,
      },
    });

    const accountRegisterMap = new Map(
      accountRegisters.map((ar) => [ar.plaidId, ar]),
    );

    const distinctAccountIds = [
      ...new Set(accountRegisters.map((ar) => ar.accountId)),
    ];
    const userAccountLinks = await this.db.userAccount.findMany({
      where: { accountId: { in: distinctAccountIds } },
      select: { accountId: true, userId: true },
    });
    const userIdByAccountId = new Map<string, number>();
    for (const link of userAccountLinks) {
      if (!userIdByAccountId.has(link.accountId)) {
        userIdByAccountId.set(link.accountId, link.userId);
      }
    }

    // Group transactions by account
    const transactionsByAccount = new Map<string, Transaction[]>();
    for (const transaction of transactions) {
      let arr = transactionsByAccount.get(transaction.account_id);
      if (!arr) {
        arr = [];
        transactionsByAccount.set(transaction.account_id, arr);
      }
      arr.push(transaction);
    }

    let totalNew = 0;
    let totalMatched = 0;
    const allErrors: string[] = [];
    const byRegister: RegisterSyncStatsRow[] = [];

    // Process each account separately to avoid the 'in' clause issue
    for (const [plaidAccountId, accountTransactions] of transactionsByAccount) {
      const accountRegister = accountRegisterMap.get(plaidAccountId);
      if (!accountRegister) {
        log({
          message: `No account register found for Plaid account ID: ${plaidAccountId}`,
          level: "warn",
        });
        continue;
      }

      const result = await this.syncTransactionsForAccount(
        accountRegister,
        accountTransactions,
        userIdByAccountId,
      );

      totalNew += result.newCount;
      totalMatched += result.matchedCount;
      allErrors.push(...result.errors);
      if (result.newCount > 0 || result.matchedCount > 0) {
        byRegister.push({
          accountRegisterId: accountRegister.id,
          name: accountRegister.name,
          newCount: result.newCount,
          updatedCount: result.matchedCount,
        });
      }
    }

    const ownerUserId =
      accountRegisters.length > 0
        ? (userIdByAccountId.get(accountRegisters[0]!.accountId) ?? null)
        : null;

    // Trigger recalculate jobs for affected accounts
    if (totalNew > 0 || totalMatched > 0) {
      const uniqueAccountIds = [
        ...new Set(accountRegisters.map((ar) => ar.accountId)),
      ];

      for (const accountId of uniqueAccountIds) {
        addRecalculateJob({ accountId });
      }
    }

    return {
      newTransactions: totalNew,
      matchedTransactions: totalMatched,
      totalProcessed: totalNew + totalMatched,
      errors: allErrors,
      byRegister,
      ownerUserId,
      fetchedTransactionCount: transactions.length,
    };
  }

  /**
   * Resolve Plaid item_id to access_token for that Item (from user settings).
   */
  private async getAccessTokenForItemId(
    itemId: string,
  ): Promise<string | null> {
    const plaidItem = await PrismaDb.plaidItem.findUnique({
      where: { itemId },
      include: { user: { select: { settings: true } } },
    });
    if (!plaidItem?.user?.settings) return null;
    const settings = plaidItem.user.settings as {
      plaid?: { access_token?: string };
    };
    return resolvePlaidAccessTokenFromStored(settings?.plaid?.access_token);
  }

  private async getItemOwnerUserId(itemId: string): Promise<number | null> {
    const row = await PrismaDb.plaidItem.findUnique({
      where: { itemId },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  private async fetchTransactionsSyncPage(
    accessToken: string,
    cursor: string,
    itemId: string,
  ): Promise<{
    added: Transaction[];
    modified: Transaction[];
    removed: Array<{ transaction_id: string }>;
    next_cursor: string;
    has_more: boolean;
  }> {
    try {
      const response = await this.client.transactionsSync({
        access_token: accessToken,
        cursor: cursor || undefined,
        options: {
          include_personal_finance_category: true,
          include_original_description: true,
        },
      });
      return response.data as {
        added: Transaction[];
        modified: Transaction[];
        removed: Array<{ transaction_id: string }>;
        next_cursor: string;
        has_more: boolean;
      };
    } catch (err) {
      await this.maybeAlertPlaidCredentialError(err, {
        path: "transactionsSync",
        itemId,
      });
      throw err;
    }
  }

  private async applySyncItemAddedTransaction(
    tx: Transaction,
    ar: AccountRegister & { type: AccountType },
    _itemOwnerUserId: number | null,
    bumpRegister: (_id: number, _kind: "new" | "updated") => void,
  ): Promise<"handled" | "unmatched"> {
    const postedPendingId = pendingTransactionIdIfPosted(tx);
    if (postedPendingId) {
      const existingPendingRow = await this.db.registerEntry.findFirst({
        where: {
          accountRegisterId: ar.id,
          plaidId: postedPendingId,
        },
      });
      if (existingPendingRow) {
        await this.transactionMatcher.updateExistingTransaction(
          existingPendingRow,
          tx,
          "exact",
          ar.type,
        );
        await this.recategorizeUnlockedPlaidEntry({
          entry: existingPendingRow,
          transaction: tx,
          accountRegister: ar,
          userId: _itemOwnerUserId,
        });
        bumpRegister(ar.id, "updated");
        log({
          message:
            "syncItemWithTransactionsSync: pending→posted updated in place",
          data: {
            accountRegisterId: ar.id,
            pendingTransactionId: postedPendingId,
            postedTransactionId: tx.transaction_id,
          },
          level: "info",
        });
        return "handled";
      }
      log({
        message:
          "syncItemWithTransactionsSync: pending→posted no row, normal match",
        data: {
          accountRegisterId: ar.id,
          pendingTransactionId: postedPendingId,
          postedTransactionId: tx.transaction_id,
        },
        level: "debug",
      });
    }

    const outcome = await this.tryDeterministicPlaidMatch(
      tx,
      ar,
      _itemOwnerUserId,
    );
    if (outcome === "skip") return "handled";
    if (outcome === "matched") {
      bumpRegister(ar.id, "updated");
      return "handled";
    }
    return "unmatched";
  }

  private async processTransactionsSyncPageAdded(
    added: Transaction[],
    registerByPlaidAccountId: Map<
      string,
      AccountRegister & { type: AccountType }
    >,
    itemOwnerUserId: number | null,
    bumpRegister: (_id: number, _kind: "new" | "updated") => void,
    itemSyncErrors: string[],
  ): Promise<void> {
    const unmatchedByRegister = new Map<
      number,
      {
        register: AccountRegister & { type: AccountType };
        transactions: Transaction[];
      }
    >();

    for (const tx of added) {
      const ar = registerByPlaidAccountId.get(tx.account_id);
      if (!ar) continue;
      try {
        const result = await this.applySyncItemAddedTransaction(
          tx,
          ar,
          itemOwnerUserId,
          bumpRegister,
        );
        if (result === "unmatched") {
          let bucket = unmatchedByRegister.get(ar.id);
          if (!bucket) {
            bucket = { register: ar, transactions: [] };
            unmatchedByRegister.set(ar.id, bucket);
          }
          bucket.transactions.push(tx);
        }
      } catch (err) {
        const msg = `added ${tx.transaction_id}: ${err instanceof Error ? err.message : String(err)}`;
        itemSyncErrors.push(msg);
        log({
          message: "syncItemWithTransactionsSync added error",
          data: { tx: tx.transaction_id, err },
          level: "error",
        });
      }
    }

    for (const { register, transactions } of unmatchedByRegister.values()) {
      try {
        const { newCount, matchedCount } =
          await this.processUnmatchedTransactionsWithAi(
            transactions,
            register,
            itemOwnerUserId,
          );
        if (newCount > 0) bumpRegister(register.id, "new");
        if (matchedCount > 0) bumpRegister(register.id, "updated");
      } catch (err) {
        const msg = `added AI batch register ${register.id}: ${err instanceof Error ? err.message : String(err)}`;
        itemSyncErrors.push(msg);
        log({
          message: "syncItemWithTransactionsSync added AI batch error",
          data: { accountRegisterId: register.id, err },
          level: "error",
        });
      }
    }
  }

  private async processTransactionsSyncPageModified(
    modified: Transaction[],
    registerByPlaidAccountId: Map<
      string,
      AccountRegister & { type: AccountType }
    >,
    bumpRegister: (_id: number, _kind: "new" | "updated") => void,
    itemSyncErrors: string[],
    itemOwnerUserId: number | null,
  ): Promise<void> {
    for (const tx of modified) {
      const ar = registerByPlaidAccountId.get(tx.account_id);
      if (!ar) continue;
      try {
        const existing = await this.db.registerEntry.findFirst({
          where: { accountRegisterId: ar.id, plaidId: tx.transaction_id },
        });
        if (existing) {
          await this.transactionMatcher.updateExistingTransaction(
            existing,
            tx,
            "exact",
            ar.type,
          );
          await this.recategorizeUnlockedPlaidEntry({
            entry: existing,
            transaction: tx,
            accountRegister: ar,
            userId: itemOwnerUserId,
          });
          bumpRegister(ar.id, "updated");
        }
      } catch (err) {
        const msg = `modified ${tx.transaction_id}: ${err instanceof Error ? err.message : String(err)}`;
        itemSyncErrors.push(msg);
        log({
          message: "syncItemWithTransactionsSync modified error",
          data: { tx: tx.transaction_id, err },
          level: "error",
        });
      }
    }
  }

  private async syncItemApplyRemovedTransactions(
    removed: Array<{ transaction_id: string }>,
    accountRegisters: (AccountRegister & { type: AccountType })[],
  ): Promise<void> {
    for (const rem of removed) {
      const tid = rem.transaction_id;
      for (const ar of accountRegisters) {
        await this.transactionMatcher.removePlaidTransactions(ar.id, [tid]);
      }
    }
  }

  private async maybeSendTransactionsSyncSummaryEmail(
    itemId: string,
    itemOwnerUserId: number | null,
    registerStats: Map<number, { new: number; updated: number }>,
    accountRegisters: (AccountRegister & { type: AccountType })[],
  ): Promise<void> {
    const totalNewFromSync = [...registerStats.values()].reduce(
      (a, s) => a + s.new,
      0,
    );
    if (totalNewFromSync <= 0 || !itemOwnerUserId) return;

    const rows: RegisterSyncStatsRow[] = accountRegisters
      .map((ar) => {
        const s = registerStats.get(ar.id) ?? { new: 0, updated: 0 };
        return {
          accountRegisterId: ar.id,
          name: ar.name,
          newCount: s.new,
          updatedCount: s.updated,
        };
      })
      .filter((r) => r.newCount > 0 || r.updatedCount > 0);
    await sendPlaidSyncSummaryEmail({
      userId: itemOwnerUserId,
      itemId,
      registers: rows,
    });
  }

  /**
   * Sync transactions for one Item using /transactions/sync (cursor-based).
   * Applies added, modified, removed; persists cursor.
   */
  async syncItemWithTransactionsSync(itemId: string): Promise<void> {
    const syncStart = dateTimeService.nowDate().getTime();
    const itemSyncErrors: string[] = [];
    let txAdded = 0;
    let txModified = 0;
    let txRemoved = 0;
    let itemOwnerUserId: number | null = null;

    try {
      const accessToken = await this.getAccessTokenForItemId(itemId);
      if (!accessToken) {
        log({
          message: "syncItemWithTransactionsSync: no access token",
          data: { itemId },
          level: "warn",
        });
        await recordPlaidSyncLog({
          syncMode: "item_cursor",
          status: "failed",
          itemId,
          userId: null,
          durationMs: dateTimeService.nowDate().getTime() - syncStart,
          errorCount: 1,
          errorSummary: "no access token",
          metadata: { reason: "missing_access_token" },
        });
        return;
      }

      itemOwnerUserId = await this.getItemOwnerUserId(itemId);

      const cursorRow = await PrismaDb.plaidSyncCursor.findUnique({
        where: { itemId },
      });
      let cursor = cursorRow?.cursor ?? "";

      const accountRegisters = await this.db.accountRegister.findMany({
        where: {
          plaidAccessToken: accessToken,
          plaidId: { not: null },
          isArchived: false,
        },
        include: { type: true },
      });
      const registerByPlaidAccountId = new Map(
        accountRegisters.map((r) => [r.plaidId!, r]),
      );

      const registerStats = new Map<number, { new: number; updated: number }>();
      for (const ar of accountRegisters) {
        registerStats.set(ar.id, { new: 0, updated: 0 });
      }
      const bumpRegister = (id: number, kind: "new" | "updated") => {
        const row = registerStats.get(id);
        if (!row) return;
        if (kind === "new") row.new += 1;
        else row.updated += 1;
      };

      let hasMore = true;
      while (hasMore) {
        const data = await this.fetchTransactionsSyncPage(
          accessToken,
          cursor,
          itemId,
        );
        txAdded += data.added.length;
        txModified += data.modified.length;
        txRemoved += data.removed.length;
        await this.processTransactionsSyncPageAdded(
          data.added,
          registerByPlaidAccountId,
          itemOwnerUserId,
          bumpRegister,
          itemSyncErrors,
        );
        await this.processTransactionsSyncPageModified(
          data.modified,
          registerByPlaidAccountId,
          bumpRegister,
          itemSyncErrors,
          itemOwnerUserId,
        );
        await this.syncItemApplyRemovedTransactions(
          data.removed,
          accountRegisters,
        );
        cursor = data.next_cursor;
        hasMore = data.has_more;
      }

      await PrismaDb.plaidSyncCursor.upsert({
        where: { itemId },
        create: { itemId, cursor },
        update: { cursor, updatedAt: dateTimeService.now().toDate() },
      });

      await this.maybeSendTransactionsSyncSummaryEmail(
        itemId,
        itemOwnerUserId,
        registerStats,
        accountRegisters,
      );

      await this.syncBalancesForAccessToken(accessToken, [
        ...registerByPlaidAccountId.keys(),
      ]);

      for (const ar of accountRegisters) {
        addRecalculateJob({ accountId: ar.accountId });
      }

      let newEntries = 0;
      let matchedEntries = 0;
      const byRegisterRows: Array<{
        accountRegisterId: number;
        name: string;
        newCount: number;
        updatedCount: number;
      }> = [];
      for (const ar of accountRegisters) {
        const s = registerStats.get(ar.id) ?? { new: 0, updated: 0 };
        newEntries += s.new;
        matchedEntries += s.updated;
        if (s.new > 0 || s.updated > 0) {
          byRegisterRows.push({
            accountRegisterId: ar.id,
            name: ar.name,
            newCount: s.new,
            updatedCount: s.updated,
          });
        }
      }

      await recordPlaidSyncLog({
        syncMode: "item_cursor",
        status: itemSyncErrors.length === 0 ? "success" : "partial",
        itemId,
        userId: itemOwnerUserId,
        durationMs: dateTimeService.nowDate().getTime() - syncStart,
        txAdded,
        txModified,
        txRemoved,
        newEntries,
        matchedEntries,
        errorCount: itemSyncErrors.length,
        errorSummary:
          itemSyncErrors.length > 0
            ? itemSyncErrors.join("\n").slice(0, 8000)
            : null,
        metadata: {
          byRegister: byRegisterRows,
        },
      });
    } catch (err) {
      const fatalMsg = err instanceof Error ? err.message : String(err);
      const errorSummary =
        itemSyncErrors.length > 0
          ? `${itemSyncErrors.join("\n")}\n---\n${fatalMsg}`.slice(0, 8000)
          : fatalMsg;
      await recordPlaidSyncLog({
        syncMode: "item_cursor",
        status: "failed",
        itemId,
        userId: itemOwnerUserId,
        durationMs: dateTimeService.nowDate().getTime() - syncStart,
        txAdded,
        txModified,
        txRemoved,
        errorCount: itemSyncErrors.length + 1,
        errorSummary,
        metadata: { phase: "syncItemWithTransactionsSync" },
      });
      throw err;
    }
  }

  private buildPlaidAccountsGroupedByToken(
    accountRegisters: {
      id: number;
      plaidId: string | null;
      plaidAccessToken: string | null;
      plaidLastSyncAt: Date | null;
    }[],
    resetSyncDates: boolean,
  ): Record<
    string,
    { plaidId: string; plaidLastSyncAt: Date; accountRegisterId: number }[]
  > {
    const plaidAccounts: Record<
      string,
      { plaidId: string; plaidLastSyncAt: Date; accountRegisterId: number }[]
    > = {};
    const fallbackSyncDate = dateTimeService
      .now()
      .subtract(DAYS_REQUESTED, "days")
      .toDate();

    for (const accountRegister of accountRegisters) {
      const token = accountRegister.plaidAccessToken;
      if (!accountRegister.plaidId || !token) continue;

      let arr = plaidAccounts[token];
      if (!arr) {
        arr = [];
        plaidAccounts[token] = arr;
      }
      arr.push({
        plaidId: accountRegister.plaidId,
        plaidLastSyncAt: resetSyncDates
          ? fallbackSyncDate
          : accountRegister.plaidLastSyncAt || fallbackSyncDate,
        accountRegisterId: accountRegister.id,
      });
    }
    return plaidAccounts;
  }

  private minPlaidSyncStartDateFromTokenAccounts(
    accountsForToken: { plaidLastSyncAt: Date }[],
  ): Date {
    const dates = accountsForToken.map((a) => a.plaidLastSyncAt);
    if (dates.length === 0) return dateTimeService.nowDate();
    const minEpoch = Math.min(
      ...dates.map((d) => dateTimeService.createUTC(d).valueOf()),
    );
    return dateTimeService.fromEpoch(minEpoch).toDate();
  }

  private async syncLegacyPlaidTransactionsForToken(
    accessToken: string,
    accountsForToken: {
      plaidId: string;
      plaidLastSyncAt: Date;
      accountRegisterId: number;
    }[],
  ): Promise<void> {
    const legacyStart = dateTimeService.nowDate().getTime();
    const startDate =
      this.minPlaidSyncStartDateFromTokenAccounts(accountsForToken);
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = dateTimeService
      .now()
      .add(DAYS_REQUESTED, "days")
      .toISOString()
      .slice(0, 10);
    const plaidAccountIds = accountsForToken.map((a) => a.plaidId);
    const syncResult = await this.syncAllTransactions({
      accessToken,
      plaidAccountIds,
      startDate: startStr,
      endDate: endStr,
    });
    await this.syncBalancesForAccessToken(accessToken, plaidAccountIds);

    const syncAtMidnightUTC = dateTimeService
      .createUTC(dateTimeService.nowDate())
      .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
      .toDate();
    for (const accountInfo of accountsForToken) {
      await this.db.accountRegister.update({
        where: { id: accountInfo.accountRegisterId },
        data: { plaidLastSyncAt: syncAtMidnightUTC },
      });
    }

    log({
      message: "Sync Plaid Transactions",
      data: {
        accountRegisterIds: accountsForToken.map((a) => a.accountRegisterId),
        syncResult,
      },
      level: "info",
    });

    if (
      syncResult.newTransactions > 0 &&
      syncResult.ownerUserId &&
      syncResult.byRegister.length > 0
    ) {
      await sendPlaidSyncSummaryEmail({
        userId: syncResult.ownerUserId,
        registers: syncResult.byRegister,
      });
    }

    const accountRegisterIds = accountsForToken.map((a) => a.accountRegisterId);
    await recordPlaidSyncLog({
      syncMode: "legacy_token_batch",
      status: syncResult.errors.length === 0 ? "success" : "partial",
      itemId: null,
      userId: syncResult.ownerUserId,
      durationMs: dateTimeService.nowDate().getTime() - legacyStart,
      txAdded: syncResult.fetchedTransactionCount,
      txModified: 0,
      txRemoved: 0,
      newEntries: syncResult.newTransactions,
      matchedEntries: syncResult.matchedTransactions,
      errorCount: syncResult.errors.length,
      errorSummary:
        syncResult.errors.length > 0
          ? syncResult.errors.join("\n").slice(0, 8000)
          : null,
      metadata: {
        byRegister: syncResult.byRegister,
        accountRegisterIds,
      },
    });
  }

  /**
   * Main sync method that orchestrates the entire sync process
   */
  async getAndSyncPlaidAccounts({
    accountRegisterId,
    resetSyncDates = false,
    itemId,
  }: {
    accountRegisterId?: number;
    resetSyncDates?: boolean;
    itemId?: string;
  } = {}): Promise<void> {
    if (itemId) {
      await this.syncItemWithTransactionsSync(itemId);
      return;
    }

    // Get account registers one by one to avoid 'in' clause with encrypted fields
    const accountRegisters = await PrismaDb.accountRegister.findMany({
      where: {
        isArchived: false,
        plaidId: { not: null },
        ...(accountRegisterId && { id: accountRegisterId }),
      },
      select: {
        id: true,
        plaidId: true,
        plaidAccessToken: true,
        plaidLastSyncAt: true,
      },
    });

    const plaidAccounts = this.buildPlaidAccountsGroupedByToken(
      accountRegisters,
      resetSyncDates,
    );

    for (const accessToken in plaidAccounts) {
      const accountsForToken = plaidAccounts[accessToken];
      if (!accountsForToken?.length) continue;
      const legacySyncStart = dateTimeService.nowDate().getTime();
      try {
        await this.syncLegacyPlaidTransactionsForToken(
          accessToken,
          accountsForToken,
        );
      } catch (error) {
        log({
          message: "error fetching account transactions",
          data: {
            error,
            accountCount: accountsForToken.length,
            accountRegisterIds: accountsForToken.map(
              (a) => a.accountRegisterId,
            ),
          },
          level: "error",
        });
        await recordPlaidSyncLog({
          syncMode: "legacy_token_batch",
          status: "failed",
          itemId: null,
          userId: null,
          durationMs: dateTimeService.nowDate().getTime() - legacySyncStart,
          errorCount: 1,
          errorSummary:
            error instanceof Error
              ? error.message.slice(0, 8000)
              : String(error),
          metadata: {
            accountRegisterIds: accountsForToken.map(
              (a) => a.accountRegisterId,
            ),
          },
        });
      }
    }
  }
}

export default PlaidSyncService;
