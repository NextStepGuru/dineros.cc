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
import {
  addPlaidBalanceSyncJob,
  addRecalculateJob,
} from "~/server/clients/queuesClient";
import { dateTimeService } from "./forecast/DateTimeService";
import TransactionMatchingService from "./TransactionMatchingService";
import PlaidTransactionEnrichmentService from "./PlaidTransactionEnrichmentService";
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

const DAYS_REQUESTED = 3;

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
}

class PlaidSyncService {
  db: PrismaClient;
  client: PlaidApi;
  transactionMatcher: TransactionMatchingService;
  plaidEnrichment: PlaidTransactionEnrichmentService;

  constructor(db: PrismaClient = PrismaDb as PrismaClient) {
    this.db = db;
    this.client = new PlaidApi(configuration);
    this.transactionMatcher = new TransactionMatchingService(db);
    this.plaidEnrichment = new PlaidTransactionEnrichmentService(db);
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
    const { description, categoryId } = await this.plaidEnrichment.enrich({
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
      ...(categoryId ? { categoryId } : {}),
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

  private async matchOrCreatePlaidTransactionForRegister(
    transaction: Transaction,
    accountRegister: AccountRegister & { type: AccountType },
    userIdByAccountId: Map<string, number>,
  ): Promise<{ newDelta: number; matchedDelta: number }> {
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
      return { newDelta: 0, matchedDelta: 0 };
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
      log({
        message: `Matched existing transaction: ${transactionDisplayLabel(transaction)}`,
        data: {
          transactionId: transaction.transaction_id,
          matchType: matchResult.matchType,
          accountRegisterId: accountRegister.id,
        },
        level: "info",
      });
      return { newDelta: 0, matchedDelta: 1 };
    }

    const enrichmentUserId =
      userIdByAccountId.get(accountRegister.accountId) ?? null;
    const transactionData = await this.buildTransactionDataForCreate(
      transaction,
      accountRegister,
      enrichmentUserId,
    );
    await this.transactionMatcher.createNewTransaction(
      transaction,
      accountRegister,
      accountRegister.type,
      transactionData,
    );
    return { newDelta: 1, matchedDelta: 0 };
  }

  /**
   * Syncs transactions for a single account register
   */
  private async syncTransactionsForAccount(
    accountRegister: AccountRegister & { type: AccountType },
    transactions: Transaction[],
    userIdByAccountId: Map<string, number> = new Map(),
  ): Promise<{ newCount: number; matchedCount: number; errors: string[] }> {
    let newCount = 0;
    let matchedCount = 0;
    const errors: string[] = [];

    const pendingIdsSuperseded = new Set<string>();
    for (const t of transactions) {
      const pid = pendingTransactionIdIfPosted(t);
      if (pid) pendingIdsSuperseded.add(pid);
    }

    for (const transaction of transactions) {
      try {
        if (this.shouldSkipSupersededPendingPlaidTxn(transaction, pendingIdsSuperseded)) {
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

        if (await this.tryPlaidPostedPendingUpdateInPlace(transaction, accountRegister)) {
          matchedCount++;
          continue;
        }

        const { newDelta, matchedDelta } =
          await this.matchOrCreatePlaidTransactionForRegister(
            transaction,
            accountRegister,
            userIdByAccountId,
          );
        newCount += newDelta;
        matchedCount += matchedDelta;
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

    return { newCount, matchedCount, errors };
  }

  /**
   * Gets account balances and updates them
   */
  async getAllAccountsByAccessTokenAndUpdateBalance({
    accessToken,
    plaidAccountIds,
  }: {
    accessToken: string;
    plaidAccountIds: string[];
  }): Promise<AccountBase[]> {
    let accountsResponse;
    try {
      accountsResponse = await this.client.accountsGet({
        access_token: accessToken,
        options: { account_ids: [...plaidAccountIds] },
      });
    } catch (err) {
      await this.maybeAlertPlaidCredentialError(err, { path: "accountsGet" });
      throw err;
    }

    const accountRegisters = await this.db.accountRegister.findMany({
      where: {
        plaidId: { in: plaidAccountIds },
        plaidAccessToken: accessToken,
      },
      select: {
        id: true,
        plaidId: true,
        type: { select: { isCredit: true } },
      },
    });

    const accountList = accountsResponse.data.accounts;
    const registerByPlaidId = new Map(
      accountRegisters.map((r) => [r.plaidId, r]),
    );
    const now = dateTimeService.nowDate();

    await Promise.all(
      accountList.map((account) => {
        const accountRegister = registerByPlaidId.get(account.account_id);
        if (!accountRegister) return Promise.resolve();

        const rawBalance = accountRegister.type.isCredit
          ? account.balances.current
          : (account.balances.available ?? account.balances.current);
        const latestBalance = accountRegister.type.isCredit
          ? Number.parseFloat(rawBalance?.toString() || "0") * -1
          : Number.parseFloat(rawBalance?.toString() || "0");

        return this.db.accountRegister.updateMany({
          where: { plaidId: account.account_id },
          data: {
            latestBalance,
            plaidBalanceLastSyncAt: now,
          },
        });
      }),
    );

    return accountList;
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
    itemOwnerUserId: number | null,
    bumpRegister: (_id: number, _kind: "new" | "updated") => void,
  ): Promise<void> {
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
        return;
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

    const matchResult = await this.transactionMatcher.matchTransaction(
      tx,
      ar,
      ar.type,
    );
    if (matchResult.matchType === "skip") return;
    if (
      matchResult.isMatched &&
      matchResult.existingEntry &&
      matchResult.matchType !== "none"
    ) {
      await this.transactionMatcher.updateExistingTransaction(
        matchResult.existingEntry,
        tx,
        matchResult.matchType,
        ar.type,
      );
      bumpRegister(ar.id, "updated");
      return;
    }
    const transactionData = await this.buildTransactionDataForCreate(
      tx,
      ar,
      itemOwnerUserId,
    );
    await this.transactionMatcher.createNewTransaction(
      tx,
      ar,
      ar.type,
      transactionData,
    );
    bumpRegister(ar.id, "new");
  }

  private async processTransactionsSyncPageAdded(
    added: Transaction[],
    registerByPlaidAccountId: Map<
      string,
      AccountRegister & { type: AccountType }
    >,
    itemOwnerUserId: number | null,
    bumpRegister: (_id: number, _kind: "new" | "updated") => void,
  ): Promise<void> {
    for (const tx of added) {
      const ar = registerByPlaidAccountId.get(tx.account_id);
      if (!ar) continue;
      try {
        await this.applySyncItemAddedTransaction(
          tx,
          ar,
          itemOwnerUserId,
          bumpRegister,
        );
      } catch (err) {
        log({
          message: "syncItemWithTransactionsSync added error",
          data: { tx: tx.transaction_id, err },
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
          bumpRegister(ar.id, "updated");
        }
      } catch (err) {
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
    const accessToken = await this.getAccessTokenForItemId(itemId);
    if (!accessToken) {
      log({
        message: "syncItemWithTransactionsSync: no access token",
        data: { itemId },
        level: "warn",
      });
      return;
    }

    const itemOwnerUserId = await this.getItemOwnerUserId(itemId);

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
      await this.processTransactionsSyncPageAdded(
        data.added,
        registerByPlaidAccountId,
        itemOwnerUserId,
        bumpRegister,
      );
      await this.processTransactionsSyncPageModified(
        data.modified,
        registerByPlaidAccountId,
        bumpRegister,
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

    for (const ar of accountRegisters) {
      addPlaidBalanceSyncJob({ accountRegisterId: ar.id });
      addRecalculateJob({ accountId: ar.accountId });
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
    const startDate = this.minPlaidSyncStartDateFromTokenAccounts(accountsForToken);
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = dateTimeService
      .now()
      .add(DAYS_REQUESTED, "days")
      .toISOString()
      .slice(0, 10);
    const syncResult = await this.syncAllTransactions({
      accessToken,
      plaidAccountIds: accountsForToken.map((a) => a.plaidId),
      startDate: startStr,
      endDate: endStr,
    });

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
  }

  /**
   * Main sync method that orchestrates the entire sync process
   */
  async getAndSyncPlaidAccounts(
    {
      accountRegisterId,
      resetSyncDates = false,
      itemId,
    }: {
      accountRegisterId?: number;
      resetSyncDates?: boolean;
      itemId?: string;
    } = {},
  ): Promise<void> {
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

    // Add balance sync jobs (only for registers we're syncing)
    const accountRegisterIdsInScope = new Set(
      Object.values(plaidAccounts).flatMap((arr) =>
        arr.map((a) => a.accountRegisterId),
      ),
    );
    for (const ar of accountRegisters) {
      if (accountRegisterIdsInScope.has(ar.id)) {
        addPlaidBalanceSyncJob({ accountRegisterId: ar.id });
      }
    }

    for (const accessToken in plaidAccounts) {
      const accountsForToken = plaidAccounts[accessToken];
      if (!accountsForToken?.length) continue;
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
            accountRegisterIds: accountsForToken.map((a) => a.accountRegisterId),
          },
          level: "error",
        });
      }
    }
  }
}

export default PlaidSyncService;
