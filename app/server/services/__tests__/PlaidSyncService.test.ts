import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~/server/clients/prismaClient";
import { log } from "~/server/logger";
import PlaidSyncService from "../PlaidSyncService";
import TransactionMatchingService from "../TransactionMatchingService";
import { PlaidSyncDetailCollector } from "../PlaidSyncDetailCollector";
import type {
  AccountRegister,
  AccountType,
  RegisterEntry,
} from "~/types/test-types";
import type { Transaction } from "plaid";

// Mock dependencies
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});
vi.mock("~/server/clients/queuesClient");
vi.mock("~/server/logger");
vi.mock("../TransactionMatchingService");
vi.mock("prisma-field-encryption", () => ({
  fieldEncryptionExtension: vi.fn(() => ({})),
}));

describe("PlaidSyncService", () => {
  let plaidSyncService: PlaidSyncService;
  let mockTransactionMatcher: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock TransactionMatchingService
    mockTransactionMatcher = {
      matchTransaction: vi.fn(),
      updateExistingTransaction: vi.fn(),
      createNewTransaction: vi.fn(),
    };

    (TransactionMatchingService as any).mockImplementation(function () {
      return mockTransactionMatcher;
    });

    plaidSyncService = new PlaidSyncService();
    vi.spyOn(plaidSyncService.plaidEnrichment, "enrich").mockResolvedValue({
      description: "Test Transaction",
      categoryId: null,
      categorySource: null,
    });
    vi.spyOn(plaidSyncService.plaidMatchAi, "matchBatch").mockResolvedValue(
      new Map(),
    );
  });

  describe("formatTransactionData", () => {
    it("should format transaction data correctly for debit accounts", () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 100,
        name: "Test Transaction",
        merchant_name: "Test Transaction",
        date: "2024-01-01",
      } as Transaction;

      const accountRegister: AccountRegister = {
        id: 1,
        plaidId: "plaid-account-id",
      } as AccountRegister;

      const accountType: AccountType = {
        isCredit: false,
      } as AccountType;

      const result = (plaidSyncService as any).formatTransactionData(
        transaction,
        accountRegister,
        accountType
      );

      expect(result.amount).toBe(-100);
      expect(result.description).toBe("Test Transaction");
      expect(result.plaidId).toBe("test-id");
      expect(result.accountRegisterId).toBe(1);
      expect(result.isPending).toBe(false);
    });

    it("should set isPending from Plaid pending flag", () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 50,
        name: "Pending",
        merchant_name: "Pending",
        date: "2024-01-01",
        pending: true,
      } as Transaction;

      const accountRegister: AccountRegister = {
        id: 1,
        plaidId: "plaid-account-id",
      } as AccountRegister;

      const accountType: AccountType = {
        isCredit: false,
      } as AccountType;

      const result = (plaidSyncService as any).formatTransactionData(
        transaction,
        accountRegister,
        accountType
      );

      expect(result.isPending).toBe(true);
    });

    it("should format transaction data correctly for credit accounts", () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 100,
        name: "Test Transaction",
        merchant_name: "Test Transaction",
        date: "2024-01-01",
      } as Transaction;

      const accountRegister: AccountRegister = {
        id: 1,
        plaidId: "plaid-account-id",
      } as AccountRegister;

      const accountType: AccountType = {
        isCredit: true,
      } as AccountType;

      const result = (plaidSyncService as any).formatTransactionData(
        transaction,
        accountRegister,
        accountType
      );

      expect(result.amount).toBe(100);
      expect(result.description).toBe("Test Transaction");
      expect(result.plaidId).toBe("test-id");
      expect(result.accountRegisterId).toBe(1);
      expect(result.isPending).toBe(false);
    });
  });

  describe("syncTransactionsForAccount", () => {
    it("should skip transaction when plaidId already exists", async () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 100,
        name: "Test Transaction",
        merchant_name: "Test Transaction",
        date: "2024-01-01",
      } as Transaction;

      const accountRegister: AccountRegister & { type: AccountType } = {
        id: 1,
        plaidId: "plaid-account-id",
        type: { isCredit: false } as AccountType,
      } as AccountRegister & { type: AccountType };

      mockTransactionMatcher.matchTransaction.mockResolvedValue({
        isMatched: false,
        matchType: "skip",
      });

      const result = await (plaidSyncService as any).syncTransactionsForAccount(
        accountRegister,
        [transaction]
      );

      expect(result.newCount).toBe(0);
      expect(result.matchedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(
        mockTransactionMatcher.createNewTransaction
      ).not.toHaveBeenCalled();
      expect(
        mockTransactionMatcher.updateExistingTransaction
      ).not.toHaveBeenCalled();
    });

    it("should create new transaction when no match found", async () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 100,
        name: "Test Transaction",
        merchant_name: "Test Transaction",
        date: "2024-01-01",
      } as Transaction;

      const accountRegister: AccountRegister & { type: AccountType } = {
        id: 1,
        plaidId: "plaid-account-id",
        type: { isCredit: false } as AccountType,
      } as AccountRegister & { type: AccountType };

      mockTransactionMatcher.matchTransaction.mockResolvedValue({
        isMatched: false,
        matchType: "none",
      });

      mockTransactionMatcher.createNewTransaction.mockResolvedValue({
        id: "new-entry-id",
      } as unknown as RegisterEntry);

      const result = await (plaidSyncService as any).syncTransactionsForAccount(
        accountRegister,
        [transaction]
      );

      expect(result.newCount).toBe(1);
      expect(result.matchedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockTransactionMatcher.createNewTransaction).toHaveBeenCalledWith(
        transaction,
        accountRegister,
        accountRegister.type,
        expect.objectContaining({
          amount: -100,
          description: "Test Transaction",
        })
      );
    });

    it("should update existing transaction when exact match found", async () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 100,
        name: "Test Transaction",
        merchant_name: "Test Transaction",
        date: "2024-01-01",
      } as Transaction;

      const accountRegister: AccountRegister & { type: AccountType } = {
        id: 1,
        plaidId: "plaid-account-id",
        type: { isCredit: false } as AccountType,
      } as AccountRegister & { type: AccountType };

      const existingEntry: RegisterEntry = {
        id: "existing-id",
        amount: -100,
        description: "Old Description",
      } as unknown as RegisterEntry;

      mockTransactionMatcher.matchTransaction.mockResolvedValue({
        isMatched: true,
        existingEntry,
        matchType: "exact",
      });

      mockTransactionMatcher.updateExistingTransaction.mockResolvedValue(
        existingEntry
      );

      const result = await (plaidSyncService as any).syncTransactionsForAccount(
        accountRegister,
        [transaction]
      );

      expect(result.newCount).toBe(0);
      expect(result.matchedCount).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(
        mockTransactionMatcher.updateExistingTransaction
      ).toHaveBeenCalledWith(
        existingEntry,
        transaction,
        "exact",
        accountRegister.type
      );
    });

    it("should update existing transaction when fuzzy match found", async () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 100,
        name: "Test Transaction",
        merchant_name: "Test Transaction",
        date: "2024-01-01",
      } as Transaction;

      const accountRegister: AccountRegister & { type: AccountType } = {
        id: 1,
        plaidId: "plaid-account-id",
        type: { isCredit: false } as AccountType,
      } as AccountRegister & { type: AccountType };

      const existingEntry: RegisterEntry = {
        id: "existing-id",
        amount: -100,
        description: "Old Description",
      } as unknown as RegisterEntry;

      mockTransactionMatcher.matchTransaction.mockResolvedValue({
        isMatched: true,
        existingEntry,
        matchType: "fuzzy",
      });

      mockTransactionMatcher.updateExistingTransaction.mockResolvedValue(
        existingEntry
      );

      const result = await (plaidSyncService as any).syncTransactionsForAccount(
        accountRegister,
        [transaction]
      );

      expect(result.newCount).toBe(0);
      expect(result.matchedCount).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(
        mockTransactionMatcher.updateExistingTransaction
      ).toHaveBeenCalledWith(
        existingEntry,
        transaction,
        "fuzzy",
        accountRegister.type
      );
    });

    it("should handle errors gracefully", async () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 100,
        name: "Test Transaction",
        merchant_name: "Test Transaction",
        date: "2024-01-01",
      } as Transaction;

      const accountRegister: AccountRegister & { type: AccountType } = {
        id: 1,
        plaidId: "plaid-account-id",
        type: { isCredit: false } as AccountType,
      } as AccountRegister & { type: AccountType };

      mockTransactionMatcher.matchTransaction.mockRejectedValue(
        new Error("Test error")
      );

      const result = await (plaidSyncService as any).syncTransactionsForAccount(
        accountRegister,
        [transaction]
      );

      expect(result.newCount).toBe(0);
      expect(result.matchedCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(
        "Failed to process transaction test-id"
      );
    });
  });

  describe("sync detail collection", () => {
    const baseTransaction: Transaction = {
      transaction_id: "test-id",
      amount: 100,
      name: "Test Transaction",
      merchant_name: "Test Transaction",
      date: "2024-01-01",
    } as Transaction;

    const baseRegister: AccountRegister & { type: AccountType } = {
      id: 1,
      plaidId: "plaid-account-id",
      accountId: "acct-1",
      type: { isCredit: false } as AccountType,
    } as AccountRegister & { type: AccountType };

    it("records an update with the match note when an exact match is found", async () => {
      const existingEntry = {
        id: "existing-id",
        amount: -100,
        description: "Old Description",
      } as unknown as RegisterEntry;

      mockTransactionMatcher.matchTransaction.mockResolvedValue({
        isMatched: true,
        existingEntry,
        matchType: "exact",
      });
      mockTransactionMatcher.updateExistingTransaction.mockResolvedValue(
        existingEntry,
      );

      const collector = new PlaidSyncDetailCollector();
      await (plaidSyncService as any).syncTransactionsForAccount(
        baseRegister,
        [baseTransaction],
        new Map(),
        collector,
      );

      const rows = collector.attachToRows([
        { accountRegisterId: 1, name: "Checking", newCount: 0, updatedCount: 1 },
      ]);
      expect(rows[0].updatedRecords).toEqual([
        {
          registerId: 1,
          entryId: "existing-id",
          note: "Matched bank transaction (exact)",
        },
      ]);
    });

    it("records a new entry when no match is found", async () => {
      mockTransactionMatcher.matchTransaction.mockResolvedValue({
        isMatched: false,
        matchType: "none",
      });
      mockTransactionMatcher.createNewTransaction.mockResolvedValue({
        id: "new-entry-id",
      } as unknown as RegisterEntry);

      const collector = new PlaidSyncDetailCollector();
      await (plaidSyncService as any).syncTransactionsForAccount(
        baseRegister,
        [baseTransaction],
        new Map(),
        collector,
      );

      const rows = collector.attachToRows([
        { accountRegisterId: 1, name: "Checking", newCount: 1, updatedCount: 0 },
      ]);
      expect(rows[0].newRecords).toEqual([
        { registerId: 1, entryId: "new-entry-id" },
      ]);
      expect(rows[0].updatedRecords).toBeUndefined();
    });

    it("records a pending→posted update with the amount change", async () => {
      const postedTx = {
        ...baseTransaction,
        transaction_id: "posted-id",
        pending_transaction_id: "pending-id",
      } as Transaction;
      const pendingRow = {
        id: "pending-row-id",
        amount: -90,
        isPending: true,
        categoryId: null,
      } as unknown as RegisterEntry;

      vi.mocked(prisma.registerEntry.findFirst).mockResolvedValue(
        pendingRow as any,
      );
      mockTransactionMatcher.updateExistingTransaction.mockResolvedValue(
        pendingRow,
      );

      const collector = new PlaidSyncDetailCollector();
      const handled = await (plaidSyncService as any).tryPlaidPostedPendingUpdateInPlace(
        postedTx,
        baseRegister,
        null,
        collector,
      );

      expect(handled).toBe(true);
      const rows = collector.attachToRows([
        { accountRegisterId: 1, name: "Checking", newCount: 0, updatedCount: 1 },
      ]);
      expect(rows[0].updatedRecords).toEqual([
        {
          registerId: 1,
          entryId: "pending-row-id",
          note: "Pending transaction posted; Amount changed -$90.00 → -$100.00",
        },
      ]);
    });

    it("records an AI match as an update", async () => {
      const existingEntry = {
        id: "ai-entry-id",
        amount: -100,
        description: "Old",
        reoccurrenceId: null,
      } as unknown as RegisterEntry;

      mockTransactionMatcher.matchTransaction.mockResolvedValue({
        isMatched: false,
        matchType: "none",
      });
      vi.mocked(prisma.registerEntry.findFirst).mockResolvedValue(
        existingEntry as any,
      );
      mockTransactionMatcher.updateExistingTransaction.mockResolvedValue(
        existingEntry,
      );
      vi.spyOn(plaidSyncService.plaidMatchAi, "matchBatch").mockResolvedValue(
        new Map([
          [
            "test-id",
            { entryId: "ai-entry-id", confidence: 0.95 } as any,
          ],
        ]),
      );

      const collector = new PlaidSyncDetailCollector();
      await (plaidSyncService as any).syncTransactionsForAccount(
        baseRegister,
        [baseTransaction],
        new Map(),
        collector,
      );

      const rows = collector.attachToRows([
        { accountRegisterId: 1, name: "Checking", newCount: 0, updatedCount: 1 },
      ]);
      expect(rows[0].updatedRecords).toEqual([
        {
          registerId: 1,
          entryId: "ai-entry-id",
          note: "AI matched to existing entry",
        },
      ]);
    });

    it("records an automatic category change", async () => {
      const existingEntry = {
        id: "existing-id",
        amount: -100,
        description: "Old Description",
        categoryId: null,
        categoryLocked: false,
      } as unknown as RegisterEntry;

      mockTransactionMatcher.matchTransaction.mockResolvedValue({
        isMatched: true,
        existingEntry,
        matchType: "exact",
      });
      mockTransactionMatcher.updateExistingTransaction.mockResolvedValue(
        existingEntry,
      );
      vi.spyOn(plaidSyncService.plaidEnrichment, "enrich").mockResolvedValue({
        description: "Test Transaction",
        categoryId: "cat-1",
        categorySource: "rule",
      });
      vi.mocked(prisma.registerEntry.update).mockResolvedValue(
        existingEntry as any,
      );

      const collector = new PlaidSyncDetailCollector();
      await (plaidSyncService as any).syncTransactionsForAccount(
        baseRegister,
        [baseTransaction],
        new Map(),
        collector,
      );

      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "existing-id" },
        data: { categoryId: "cat-1", categorySource: "rule" },
      });
      const rows = collector.attachToRows([
        { accountRegisterId: 1, name: "Checking", newCount: 0, updatedCount: 1 },
      ]);
      expect(rows[0].categoryChanges).toEqual([
        {
          registerId: 1,
          entryId: "existing-id",
          fromCategoryId: null,
          toCategoryId: "cat-1",
          source: "rule",
        },
      ]);
    });

    it("bumps register stats with the real AI-batch deltas", async () => {
      const txA = {
        ...baseTransaction,
        account_id: "plaid-account-id",
        transaction_id: "tx-a",
      } as Transaction;
      const txB = {
        ...baseTransaction,
        account_id: "plaid-account-id",
        transaction_id: "tx-b",
      } as Transaction;

      mockTransactionMatcher.matchTransaction.mockResolvedValue({
        isMatched: false,
        matchType: "none",
      });
      mockTransactionMatcher.createNewTransaction.mockResolvedValue({
        id: "created-id",
      } as unknown as RegisterEntry);

      const bump = vi.fn();
      await (plaidSyncService as any).processTransactionsSyncPageAdded(
        [txA, txB],
        new Map([["plaid-account-id", baseRegister]]),
        null,
        bump,
        [],
      );

      expect(bump).toHaveBeenCalledWith(1, "new", 2);
    });
  });

  describe("logging (no token leakage)", () => {
    it("Transactions fetched log payload does not include the Plaid access token", async () => {
      vi.mocked(log).mockClear();
      vi.spyOn(plaidSyncService.client, "transactionsGet").mockResolvedValue({
        data: { transactions: [] },
      } as any);
      vi.mocked(prisma.accountRegister.findMany).mockResolvedValue([]);
      vi.mocked(prisma.userAccount.findMany).mockResolvedValue([]);

      await plaidSyncService.syncAllTransactions({
        accessToken: "secret-plaid-access-token-xyz",
        plaidAccountIds: ["plaid-acc-1"],
        startDate: "2024-01-01",
        endDate: "2024-01-02",
      });

      const fetchedCall = vi.mocked(log).mock.calls.find(
        (c) => (c[0] as { message?: string }).message === "Transactions fetched",
      );
      expect(fetchedCall).toBeDefined();
      expect(JSON.stringify(fetchedCall![0])).not.toContain(
        "secret-plaid-access-token",
      );
    });
  });

  describe("getAllAccountsByAccessTokenAndUpdateBalance", () => {
    const plaidAccount = (accountId: string, current: number) => ({
      account_id: accountId,
      balances: { current, available: current, iso_currency_code: "USD" },
    });

    it("returns changed register ids when the Plaid balance moved", async () => {
      vi.spyOn(plaidSyncService.client, "accountsGet").mockResolvedValue({
        data: {
          accounts: [plaidAccount("plaid-acc-1", 100), plaidAccount("plaid-acc-2", 50)],
        },
      } as any);
      vi.mocked(prisma.accountRegister.findMany).mockResolvedValue([
        { id: 11, plaidId: "plaid-acc-1", latestBalance: 150, type: { isCredit: false } },
        { id: 12, plaidId: "plaid-acc-2", latestBalance: 50, type: { isCredit: false } },
      ] as any);

      const result =
        await plaidSyncService.getAllAccountsByAccessTokenAndUpdateBalance({
          accessToken: "test-token",
          plaidAccountIds: ["plaid-acc-1", "plaid-acc-2"],
        });

      expect(result.accounts).toHaveLength(2);
      expect(result.changedRegisterIds).toEqual([11]);
      expect(prisma.accountRegister.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 11 },
          data: expect.objectContaining({ latestBalance: 100 }),
        }),
      );
    });

    it("returns no changed ids when balances are unchanged", async () => {
      vi.spyOn(plaidSyncService.client, "accountsGet").mockResolvedValue({
        data: { accounts: [plaidAccount("plaid-acc-1", 75)] },
      } as any);
      vi.mocked(prisma.accountRegister.findMany).mockResolvedValue([
        { id: 21, plaidId: "plaid-acc-1", latestBalance: 75, type: { isCredit: false } },
      ] as any);

      const result =
        await plaidSyncService.getAllAccountsByAccessTokenAndUpdateBalance({
          accessToken: "test-token",
          plaidAccountIds: ["plaid-acc-1"],
        });

      expect(result.accounts).toHaveLength(1);
      expect(result.changedRegisterIds).toEqual([]);
    });
  });
});
