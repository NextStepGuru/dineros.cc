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
        if (
          transaction.pending === true &&
          pendingIdsSuperseded.has(transaction.transaction_id)
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

        const postedPendingId = pendingTransactionIdIfPosted(transaction);
        if (postedPendingId) {
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
            matchedCount++;
            log({
              message: "Plaid pending→posted: updated register entry in place",
              data: {
                accountRegisterId: accountRegister.id,
                pendingTransactionId: postedPendingId,
                postedTransactionId: transaction.transaction_id,
              },
              level: "info",
            });
            continue;
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
        }

        const matchResult = await this.transactionMatcher.matchTransaction(
          transaction,
          accountRegister,
          accountRegister.type,
        );

        if (matchResult.matchType === "skip") {
          // Transaction already exists, skip it
          log({
            message: `Skipping existing Plaid transaction: ${transactionDisplayLabel(transaction)}`,
            data: {
              transactionId: transaction.transaction_id,
              accountRegisterId: accountRegister.id,
            },
            level: "debug",
          });
        } else if (
          matchResult.isMatched &&
          matchResult.existingEntry &&
          matchResult.matchType !== "none"
        ) {
          // Update existing transaction
          await this.transactionMatcher.updateExistingTransaction(
            matchResult.existingEntry,
            transaction,
            matchResult.matchType as "exact" | "fuzzy" | "reoccurrence",
            accountRegister.type,
          );
          matchedCount++;

          log({
            message: `Matched existing transaction: ${transactionDisplayLabel(transaction)}`,
            data: {
              transactionId: transaction.transaction_id,
              matchType: matchResult.matchType,
              accountRegisterId: accountRegister.id,
            },
            level: "info",
          });
        } else {
          // Create new transaction
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
          newCount++;
        }
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
    const [accountsResponse, accountRegisters] = await Promise.all([
      this.client.accountsGet({
        access_token: accessToken,
        options: { account_ids: [...plaidAccountIds] },
      }),
      this.db.accountRegister.findMany({
        where: {
          plaidId: { in: plaidAccountIds },
          plaidAccessToken: accessToken,
        },
        select: {
          id: true,
          plaidId: true,
          type: { select: { isCredit: true } },
        },
      }),
    ]);

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
          ? parseFloat(rawBalance?.toString() || "0") * -1
          : parseFloat(rawBalance?.toString() || "0");

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
    const transactions = await this.client.transactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: {
        account_ids: plaidAccountIds,
      },
    });

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
      if (!transactionsByAccount.has(transaction.account_id)) {
        transactionsByAccount.set(transaction.account_id, []);
      }
      transactionsByAccount.get(transaction.account_id)!.push(transaction);
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
    return settings?.plaid?.access_token ?? null;
  }

  private async getItemOwnerUserId(itemId: string): Promise<number | null> {
    const row = await PrismaDb.plaidItem.findUnique({
      where: { itemId },
      select: { userId: true },
    });
    return row?.userId ?? null;
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
      const response = await this.client.transactionsSync({
        access_token: accessToken,
        cursor: cursor || undefined,
      });
      const data = response.data as {
        added: Transaction[];
        modified: Transaction[];
        removed: Array<{ transaction_id: string }>;
        next_cursor: string;
        has_more: boolean;
      };

      for (const tx of data.added) {
        const ar = registerByPlaidAccountId.get(tx.account_id);
        if (!ar) continue;
        try {
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
              continue;
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
          if (matchResult.matchType === "skip") continue;
          if (
            matchResult.isMatched &&
            matchResult.existingEntry &&
            matchResult.matchType !== "none"
          ) {
            await this.transactionMatcher.updateExistingTransaction(
              matchResult.existingEntry,
              tx,
              matchResult.matchType as "exact" | "fuzzy" | "reoccurrence",
              ar.type,
            );
            bumpRegister(ar.id, "updated");
          } else {
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
        } catch (err) {
          log({
            message: "syncItemWithTransactionsSync added error",
            data: { tx: tx.transaction_id, err },
            level: "error",
          });
        }
      }

      for (const tx of data.modified) {
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

      for (const rem of data.removed) {
        const tid = rem.transaction_id;
        for (const ar of accountRegisters) {
          await this.transactionMatcher.removePlaidTransactions(ar.id, [tid]);
        }
      }

      cursor = data.next_cursor;
      hasMore = data.has_more;
    }

    await PrismaDb.plaidSyncCursor.upsert({
      where: { itemId },
      create: { itemId, cursor },
      update: { cursor, updatedAt: dateTimeService.now().toDate() },
    });

    const totalNewFromSync = [...registerStats.values()].reduce(
      (a, s) => a + s.new,
      0,
    );
    if (totalNewFromSync > 0 && itemOwnerUserId) {
      const rows: RegisterSyncStatsRow[] = accountRegisters
        .map((ar) => {
          const s = registerStats.get(ar.id)!;
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

    for (const ar of accountRegisters) {
      addPlaidBalanceSyncJob({ accountRegisterId: ar.id });
      addRecalculateJob({ accountId: ar.accountId });
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
    } = { resetSyncDates: false },
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

    const plaidAccounts: Record<
      string,
      { plaidId: string; plaidLastSyncAt: Date; accountRegisterId: number }[]
    > = {};

    for (const accountRegister of accountRegisters) {
      const token = accountRegister.plaidAccessToken;
      if (accountRegister.plaidId && token) {
        if (!plaidAccounts[token]) {
          plaidAccounts[token] = [];
        }

        plaidAccounts[token]!.push({
          plaidId: accountRegister.plaidId!,
          plaidLastSyncAt: resetSyncDates
            ? dateTimeService.now().subtract(DAYS_REQUESTED, "days").toDate()
            : accountRegister.plaidLastSyncAt ||
              dateTimeService.now().subtract(DAYS_REQUESTED, "days").toDate(),
          accountRegisterId: accountRegister.id,
        });
      }
    }

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

    // Process each access token separately
    for (const accessToken in plaidAccounts) {
      const accountsForToken = plaidAccounts[accessToken];
      if (!accountsForToken?.length) continue;
      try {
        const startDate = (() => {
          const dates = accountsForToken.map((a) => a.plaidLastSyncAt);
          if (dates.length === 0) return dateTimeService.nowDate();
          const minEpoch = Math.min(
            ...dates.map((d) => dateTimeService.createUTC(d).valueOf()),
          );
          return dateTimeService.fromEpoch(minEpoch).toDate();
        })();

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

        // Update sync dates for all accounts with this token
        for (const accountInfo of accountsForToken) {
          await this.db.accountRegister.update({
            where: { id: accountInfo.accountRegisterId },
            data: {
              plaidLastSyncAt: dateTimeService
                .createUTC(dateTimeService.nowDate())
                .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
                .toDate(),
            },
          });
        }

        log({
          message: "Sync Plaid Transactions",
          data: {
            accessToken,
            plaidAccountIds: accountsForToken,
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
      } catch (error) {
        log({
          message: "error fetching account transactions",
          data: { error },
          level: "error",
        });
      }
    }
  }
}

export default PlaidSyncService;
