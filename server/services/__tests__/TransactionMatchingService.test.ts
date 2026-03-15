import { describe, it, expect, vi, beforeEach } from "vitest";
import TransactionMatchingService from "../TransactionMatchingService";
import type {
  AccountRegister,
  AccountType,
  RegisterEntry,
} from "~/types/test-types";
import type { Transaction } from "plaid";

// Mock dependencies
vi.mock("~/server/logger");

describe("TransactionMatchingService", () => {
  let transactionMatchingService: TransactionMatchingService;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      registerEntry: {
        findFirst: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
    };

    transactionMatchingService = new TransactionMatchingService(mockDb);
  });

  describe("matchTransaction", () => {
    it("should find exact match when date and amount match", async () => {
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

      const existingEntry: RegisterEntry = {
        id: "existing-id",
        amount: -100,
        description: "Old Description",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      } as unknown as RegisterEntry;

      // First call returns null (no existing plaid transaction)
      // Second call returns the exact match
      mockDb.registerEntry.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingEntry);

      const result = await transactionMatchingService.matchTransaction(
        transaction,
        accountRegister,
        accountType
      );

      expect(result.isMatched).toBe(true);
      expect(result.existingEntry).toBe(existingEntry);
      expect(result.matchType).toBe("exact");
      // Check that the exact match call was made (second call)
      expect(mockDb.registerEntry.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          accountRegisterId: 1,
          amount: -100,
          createdAt: {
            gte: expect.any(Date),
            lt: expect.any(Date),
          },
          plaidId: null,
        },
      });
    });

    it("should find fuzzy match when amount matches but date is off by several days", async () => {
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

      const existingEntry: RegisterEntry = {
        id: "existing-id",
        amount: -100,
        description: "Old Description",
        createdAt: new Date("2024-01-05T00:00:00.000Z"), // 4 days later
      } as unknown as RegisterEntry;

      // First call returns null (no existing plaid transaction)
      // Second call returns null (no exact match)
      // Third call returns the fuzzy match
      mockDb.registerEntry.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingEntry);

      const result = await transactionMatchingService.matchTransaction(
        transaction,
        accountRegister,
        accountType
      );

      expect(result.isMatched).toBe(true);
      expect(result.existingEntry).toBe(existingEntry);
      expect(result.matchType).toBe("fuzzy");
    });

    it("should skip when transaction with same plaidId already exists", async () => {
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

      const existingEntry: RegisterEntry = {
        id: "existing-id",
        plaidId: "test-id",
        amount: -100,
        description: "Existing Transaction",
      } as unknown as RegisterEntry;

      mockDb.registerEntry.findFirst.mockResolvedValue(existingEntry);

      const result = await transactionMatchingService.matchTransaction(
        transaction,
        accountRegister,
        accountType
      );

      expect(result.isMatched).toBe(false);
      expect(result.existingEntry).toBeUndefined();
      expect(result.matchType).toBe("skip");
    });

    it("should return no match when no existing transaction found", async () => {
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

      // First call returns null (no existing plaid transaction)
      // Second call returns null (no exact match)
      // Third call returns null (no fuzzy match within 5 days)
      mockDb.registerEntry.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await transactionMatchingService.matchTransaction(
        transaction,
        accountRegister,
        accountType
      );

      expect(result.isMatched).toBe(false);
      expect(result.existingEntry).toBeUndefined();
      expect(result.matchType).toBe("none");
    });

    it("should handle credit accounts correctly", async () => {
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

      const existingEntry: RegisterEntry = {
        id: "existing-id",
        amount: 100, // Positive for credit accounts
        description: "Old Description",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      } as RegisterEntry;

      // First call returns null (no existing plaid transaction)
      // Second call returns the exact match
      mockDb.registerEntry.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingEntry);

      const result = await transactionMatchingService.matchTransaction(
        transaction,
        accountRegister,
        accountType
      );

      expect(result.isMatched).toBe(true);
      expect(result.existingEntry).toBe(existingEntry);
      expect(result.matchType).toBe("exact");
      // Check that the exact match call was made (second call)
      expect(mockDb.registerEntry.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          accountRegisterId: 1,
          amount: 100, // Should be positive for credit accounts
          createdAt: {
            gte: expect.any(Date),
            lt: expect.any(Date),
          },
          plaidId: null,
        },
      });
    });

    it("should respect fuzzy matching options", async () => {
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

      // First call returns null (no existing plaid transaction)
      // Second call returns null (no exact match)
      mockDb.registerEntry.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await transactionMatchingService.matchTransaction(
        transaction,
        accountRegister,
        accountType,
        { enableFuzzyMatching: false }
      );

      expect(result.isMatched).toBe(false);
      expect(result.matchType).toBe("none");
      // Should call findFirst twice (for plaid check and exact match only)
      expect(mockDb.registerEntry.findFirst).toHaveBeenCalledTimes(2);
    });

    it("should exclude entries with existing plaidId from all searches", async () => {
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

      // All searches should return null
      mockDb.registerEntry.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await transactionMatchingService.matchTransaction(
        transaction,
        accountRegister,
        accountType
      );

      expect(result.isMatched).toBe(false);
      expect(result.matchType).toBe("none");

      // Verify that all searches exclude entries with plaidId
      expect(mockDb.registerEntry.findFirst).toHaveBeenNthCalledWith(1, {
        where: {
          accountRegisterId: 1,
          plaidId: "test-id",
        },
      });

      expect(mockDb.registerEntry.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          accountRegisterId: 1,
          amount: -100,
          createdAt: {
            gte: expect.any(Date),
            lt: expect.any(Date),
          },
          plaidId: null, // Should exclude entries with plaidId
        },
      });

      expect(mockDb.registerEntry.findFirst).toHaveBeenNthCalledWith(3, {
        where: {
          accountRegisterId: 1,
          amount: -100,
          createdAt: {
            gte: expect.any(Date), // 5 days before
            lte: expect.any(Date), // 5 days after
          },
          plaidId: null, // Should exclude entries with plaidId
        },
      });
    });
  });

  describe("updateExistingTransaction", () => {
    it("should update transaction with Plaid data", async () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 100,
        name: "Updated Transaction Name",
        date: "2024-01-01",
      } as Transaction;

      const existingEntry: RegisterEntry = {
        id: "existing-id",
        amount: -100,
        description: "Old Description",
      } as RegisterEntry;

      const updatedEntry: RegisterEntry = {
        ...existingEntry,
        plaidId: "test-id",
        description: "Updated Transaction Name",
      } as RegisterEntry;

      mockDb.registerEntry.update.mockResolvedValue(updatedEntry);

      const result = await transactionMatchingService.updateExistingTransaction(
        existingEntry,
        transaction,
        "exact"
      );

      expect(result).toBe(updatedEntry);
      expect(mockDb.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "existing-id" },
        data: {
          plaidId: "test-id",
          plaidJson: JSON.parse(JSON.stringify(transaction)),
          // description is preserved, not updated
        },
      });
    });

    it("should update date for fuzzy matches", async () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 100,
        name: "Updated Transaction Name",
        date: "2024-01-01",
      } as Transaction;

      const existingEntry: RegisterEntry = {
        id: "existing-id",
        amount: -100,
        description: "Old Description",
        createdAt: new Date("2024-01-02T00:00:00.000Z"),
      } as RegisterEntry;

      const updatedEntry: RegisterEntry = {
        ...existingEntry,
        plaidId: "test-id",
        description: "Updated Transaction Name",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      } as RegisterEntry;

      mockDb.registerEntry.update.mockResolvedValue(updatedEntry);

      const result = await transactionMatchingService.updateExistingTransaction(
        existingEntry,
        transaction,
        "fuzzy"
      );

      expect(result).toBe(updatedEntry);
      expect(mockDb.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "existing-id" },
        data: {
          plaidId: "test-id",
          plaidJson: JSON.parse(JSON.stringify(transaction)),
          // description is preserved, not updated
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
        },
      });
    });
  });

  describe("createNewTransaction", () => {
    it("should create new transaction entry", async () => {
      const transaction: Transaction = {
        transaction_id: "test-id",
        amount: 100,
        name: "New Transaction",
        date: "2024-01-01",
      } as Transaction;

      const accountRegister: AccountRegister = {
        id: 1,
        plaidId: "plaid-account-id",
      } as AccountRegister;

      const accountType: AccountType = {
        isCredit: false,
      } as AccountType;

      const transactionData = {
        id: "new-id",
        accountRegisterId: 1,
        amount: -100,
        description: "New Transaction",
        plaidId: "test-id",
      };

      const newEntry: RegisterEntry = {
        id: "new-id",
        ...transactionData,
      } as RegisterEntry;

      mockDb.registerEntry.create.mockResolvedValue(newEntry);

      const result = await transactionMatchingService.createNewTransaction(
        transaction,
        accountRegister,
        accountType,
        transactionData
      );

      expect(result).toBe(newEntry);
      expect(mockDb.registerEntry.create).toHaveBeenCalledWith({
        data: transactionData,
      });
    });
  });
});
