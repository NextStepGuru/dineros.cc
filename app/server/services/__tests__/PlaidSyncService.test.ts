import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~/server/clients/prismaClient";
import { log } from "~/server/logger";
import PlaidSyncService from "../PlaidSyncService";
import TransactionMatchingService from "../TransactionMatchingService";
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

    (TransactionMatchingService as any).mockImplementation(
      () => mockTransactionMatcher
    );

    plaidSyncService = new PlaidSyncService();
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
});
