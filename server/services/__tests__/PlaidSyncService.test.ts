import { describe, it, expect, vi, beforeEach } from "vitest";
import PlaidSyncService from "../PlaidSyncService";
import TransactionMatchingService from "../TransactionMatchingService";
import type {
  AccountRegister,
  AccountType,
  RegisterEntry,
} from "~/types/test-types";
import type { Transaction } from "plaid";

// Mock dependencies
vi.mock("~/server/clients/prismaClient", () => ({
  prisma: {
    accountRegister: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    registerEntry: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  globalClient: {
    $extends: vi.fn(() => ({
      accountRegister: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      registerEntry: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    })),
  },
}));
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
    });

    it("should format transaction data correctly for credit accounts", () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 100,
        name: "Test Transaction",
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
    });
  });

  describe("syncTransactionsForAccount", () => {
    it("should skip transaction when plaidId already exists", async () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 100,
        name: "Test Transaction",
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
      ).toHaveBeenCalledWith(existingEntry, transaction, "exact");
    });

    it("should update existing transaction when fuzzy match found", async () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 100,
        name: "Test Transaction",
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
      ).toHaveBeenCalledWith(existingEntry, transaction, "fuzzy");
    });

    it("should handle errors gracefully", async () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 100,
        name: "Test Transaction",
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
});
