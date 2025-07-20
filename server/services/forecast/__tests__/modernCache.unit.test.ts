import { describe, it, expect, beforeEach } from "vitest";
import { ModernCacheService } from "../ModernCacheService";
import type {
  CacheAccountRegister,
  CacheRegisterEntry,
} from "../ModernCacheService";
import moment from "moment";

describe("ModernCacheService", () => {
  let cache: ModernCacheService;

  beforeEach(() => {
    cache = new ModernCacheService();
  });

  describe("AccountRegister Operations", () => {
    const testAccount: CacheAccountRegister = {
      id: 1,
      typeId: 1,
      budgetId: 1,
      accountId: "test-account",
      name: "Test Account",
      balance: 1000,
      latestBalance: 1000,
      minPayment: 50,
      statementAt: moment(),
      apr1: 0.15,
      apr1StartAt: new Date(),
      apr2: null,
      apr2StartAt: null,
      apr3: null,
      apr3StartAt: null,
      targetAccountRegisterId: null,
      loanStartAt: new Date(),
      loanPaymentsPerYear: 12,
      loanTotalYears: 30,
      loanOriginalAmount: 100000,
      loanPaymentSortOrder: 1,
      minAccountBalance: 500,
      allowExtraPayment: true,
      isArchived: false,
      plaidId: null,
    };

    it("should insert and find account register", () => {
      cache.accountRegister.insert(testAccount);

      const found = cache.accountRegister.findById(1);
      expect(found).toEqual(testAccount);
    });

    it("should find by simple query", () => {
      cache.accountRegister.insert(testAccount);

      const results = cache.accountRegister.find({ typeId: 1 });
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(testAccount);
    });

    it("should find by function query", () => {
      cache.accountRegister.insert(testAccount);

      const results = cache.accountRegister.find(
        (account) => account.balance > 500 && account.allowExtraPayment === true
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(testAccount);
    });

    it("should update account register", () => {
      cache.accountRegister.insert(testAccount);

      const updated = { ...testAccount, balance: 2000 };
      cache.accountRegister.update(updated);

      const found = cache.accountRegister.findById(1);
      expect(found?.balance).toBe(2000);
    });

    it("should use indexed queries for performance", () => {
      // Insert multiple accounts
      for (let i = 1; i <= 1000; i++) {
        cache.accountRegister.insert({
          ...testAccount,
          id: i,
          typeId: (i % 5) + 1, // Types 1-5
        });
      }

      // This should use the typeId index for fast lookup
      const start = performance.now();
      const results = cache.accountRegister.find({ typeId: 3 });
      const end = performance.now();

      expect(results.length).toBe(200); // Every 5th account
      expect(end - start).toBeLessThan(5); // Should be very fast
    });
  });

  describe("RegisterEntry Operations", () => {
    const testEntry: CacheRegisterEntry = {
      id: "entry-1",
      seq: 1,
      accountRegisterId: 1,
      sourceAccountRegisterId: null,
      createdAt: moment(),
      description: "Test Entry",
      reoccurrenceId: null,
      amount: 100,
      balance: 1100,
      isBalanceEntry: false,
      isPending: false,
      isCleared: false,
      isProjected: true,
      isManualEntry: false,
      isReconciled: false,
    };

    it("should insert and find register entry", () => {
      cache.registerEntry.insert(testEntry);

      const found = cache.registerEntry.findById("entry-1");
      expect(found).toEqual(testEntry);
    });

    it("should find entries by account ID", () => {
      cache.registerEntry.insert(testEntry);
      cache.registerEntry.insert({
        ...testEntry,
        id: "entry-2",
        accountRegisterId: 2,
      });

      const results = cache.registerEntry.find({ accountRegisterId: 1 });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("entry-1");
    });

    it("should handle complex function queries", () => {
      cache.registerEntry.insert(testEntry);
      cache.registerEntry.insert({
        ...testEntry,
        id: "entry-2",
        amount: -50,
        isProjected: false,
      });

      const results = cache.registerEntry.find(
        (entry) => entry.amount > 0 && entry.isProjected === true
      );

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("entry-1");
    });
  });

  describe("Chain Operations", () => {
    beforeEach(() => {
      // Insert test data
      for (let i = 1; i <= 100; i++) {
        cache.accountRegister.insert({
          id: i,
          typeId: 1,
          budgetId: 1,
          accountId: "test-account",
          name: `Account ${i}`,
          balance: i * 100,
          latestBalance: i * 100,
          minPayment: 50,
          statementAt: moment(),
          apr1: 0.15,
          apr1StartAt: new Date(),
          apr2: null,
          apr2StartAt: null,
          apr3: null,
          apr3StartAt: null,
          targetAccountRegisterId: null,
          loanStartAt: new Date(),
          loanPaymentsPerYear: 12,
          loanTotalYears: 30,
          loanOriginalAmount: 100000,
          loanPaymentSortOrder: i,
          minAccountBalance: 500,
          allowExtraPayment: i % 2 === 0,
          isArchived: false,
          plaidId: null,
        });
      }
    });

    it("should chain find, sort, and limit operations", () => {
      const results = cache.accountRegister
        .chain()
        .find((account) => account.balance > 5000)
        .simplesort("balance", true) // Descending
        .limit(5)
        .data();

      expect(results).toHaveLength(5);
      expect(results[0].balance).toBe(10000); // Highest balance
      expect(results[4].balance).toBe(9600); // 5th highest
    });

    it("should handle empty chain results", () => {
      const results = cache.accountRegister
        .chain()
        .find((account) => account.balance > 100000) // No matches
        .limit(10)
        .data();

      expect(results).toHaveLength(0);
    });
  });

  describe("Cache Statistics", () => {
    it("should provide accurate statistics", () => {
      // Add some test data
      cache.accountRegister.insert({
        id: 1,
        typeId: 1,
        budgetId: 1,
        accountId: "test",
        name: "Test",
        balance: 1000,
        latestBalance: 1000,
        minPayment: 50,
        statementAt: moment(),
        apr1: 0.15,
        apr1StartAt: new Date(),
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        targetAccountRegisterId: null,
        loanStartAt: new Date(),
        loanPaymentsPerYear: 12,
        loanTotalYears: 30,
        loanOriginalAmount: 100000,
        loanPaymentSortOrder: 1,
        minAccountBalance: 500,
        allowExtraPayment: true,
        isArchived: false,
        plaidId: null,
      });

      cache.registerEntry.insert({
        id: "entry-1",
        seq: 1,
        accountRegisterId: 1,
        sourceAccountRegisterId: null,
        createdAt: moment(),
        description: "Test",
        reoccurrenceId: null,
        amount: 100,
        balance: 1100,
        isBalanceEntry: false,
        isPending: false,
        isCleared: false,
        isProjected: true,
        isManualEntry: false,
        isReconciled: false,
      });

      const stats = cache.getStats();
      expect(stats.accountRegisters).toBe(1);
      expect(stats.registerEntries).toBe(1);
      expect(stats.reoccurrences).toBe(0);
      expect(stats.reoccurrenceSkips).toBe(0);
    });
  });

  describe("Memory Management", () => {
    it("should clear all collections", () => {
      // Add test data
      cache.accountRegister.insert({
        id: 1,
        typeId: 1,
        budgetId: 1,
        accountId: "test",
        name: "Test",
        balance: 1000,
        latestBalance: 1000,
        minPayment: 50,
        statementAt: moment(),
        apr1: 0.15,
        apr1StartAt: new Date(),
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        targetAccountRegisterId: null,
        loanStartAt: new Date(),
        loanPaymentsPerYear: 12,
        loanTotalYears: 30,
        loanOriginalAmount: 100000,
        loanPaymentSortOrder: 1,
        minAccountBalance: 500,
        allowExtraPayment: true,
        isArchived: false,
        plaidId: null,
      });

      expect(cache.getStats().accountRegisters).toBe(1);

      cache.clearAll();

      const stats = cache.getStats();
      expect(stats.accountRegisters).toBe(0);
      expect(stats.registerEntries).toBe(0);
      expect(stats.reoccurrences).toBe(0);
      expect(stats.reoccurrenceSkips).toBe(0);
    });
  });

  describe("Performance Characteristics", () => {
    it("should handle large datasets efficiently", () => {
      const startTime = performance.now();

      // Insert 10,000 accounts
      for (let i = 1; i <= 10000; i++) {
        cache.accountRegister.insert({
          id: i,
          typeId: (i % 10) + 1,
          budgetId: 1,
          accountId: "test-account",
          name: `Account ${i}`,
          balance: Math.random() * 10000,
          latestBalance: Math.random() * 10000,
          minPayment: 50,
          statementAt: moment(),
          apr1: 0.15,
          apr1StartAt: new Date(),
          apr2: null,
          apr2StartAt: null,
          apr3: null,
          apr3StartAt: null,
          targetAccountRegisterId: null,
          loanStartAt: new Date(),
          loanPaymentsPerYear: 12,
          loanTotalYears: 30,
          loanOriginalAmount: 100000,
          loanPaymentSortOrder: i,
          minAccountBalance: 500,
          allowExtraPayment: true,
          isArchived: false,
          plaidId: null,
        });
      }

      const insertTime = performance.now() - startTime;

      // Test query performance
      const queryStart = performance.now();
      const results = cache.accountRegister.find({ typeId: 5 });
      const queryTime = performance.now() - queryStart;

      expect(results).toHaveLength(1000); // Every 10th account
      expect(insertTime).toBeLessThan(1000); // Should insert quickly
      expect(queryTime).toBeLessThan(100); // Should query quickly (relaxed for CI)
    });
  });
});

describe("ModernCacheService - Complex Query Operators", () => {
  let cache: ModernCacheService;

  beforeEach(() => {
    cache = new ModernCacheService();
  });

  describe("Complex Query Operators", () => {
    it("should handle $eq operator", () => {
      const entry = {
        id: "1",
        accountRegisterId: 1,
        description: "Test",
        amount: 100,
        balance: 1000,
        createdAt: moment(),
        isBalanceEntry: false,
        isPending: false,
        isCleared: false,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
        reoccurrenceId: null,
        sourceAccountRegisterId: null,
        seq: null,
      };

      cache.registerEntry.insert(entry);

      const result = cache.registerEntry.find({
        amount: { $eq: 100 } as any,
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("should handle $ne operator", () => {
      const entry1 = {
        id: "1",
        accountRegisterId: 1,
        description: "Test1",
        amount: 100,
        balance: 1000,
        createdAt: moment(),
        isBalanceEntry: false,
        isPending: false,
        isCleared: false,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
        reoccurrenceId: null,
        sourceAccountRegisterId: null,
        seq: null,
      };

      const entry2 = {
        id: "2",
        accountRegisterId: 1,
        description: "Test2",
        amount: 200,
        balance: 1200,
        createdAt: moment(),
        isBalanceEntry: false,
        isPending: false,
        isCleared: false,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
        reoccurrenceId: null,
        sourceAccountRegisterId: null,
        seq: null,
      };

      cache.registerEntry.insert(entry1);
      cache.registerEntry.insert(entry2);

      const result = cache.registerEntry.find({
        amount: { $ne: 100 } as any,
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2");
    });

    it("should handle $lt operator", () => {
      const entry1 = { id: "1", amount: 50 };
      const entry2 = { id: "2", amount: 150 };
      const entry3 = { id: "3", amount: 250 };

      cache.registerEntry.insert(entry1 as any);
      cache.registerEntry.insert(entry2 as any);
      cache.registerEntry.insert(entry3 as any);

      const result = cache.registerEntry.find({
        amount: { $lt: 100 },
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("should handle $lte operator", () => {
      const entry1 = { id: "1", amount: 50 };
      const entry2 = { id: "2", amount: 100 };
      const entry3 = { id: "3", amount: 150 };

      cache.registerEntry.insert(entry1 as any);
      cache.registerEntry.insert(entry2 as any);
      cache.registerEntry.insert(entry3 as any);

      const result = cache.registerEntry.find({
        amount: { $lte: 100 },
      });

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toContain("1");
      expect(result.map((r) => r.id)).toContain("2");
    });

    it("should handle $gt operator", () => {
      const entry1 = { id: "1", amount: 50 };
      const entry2 = { id: "2", amount: 100 };
      const entry3 = { id: "3", amount: 150 };

      cache.registerEntry.insert(entry1 as any);
      cache.registerEntry.insert(entry2 as any);
      cache.registerEntry.insert(entry3 as any);

      const result = cache.registerEntry.find({
        amount: { $gt: 100 },
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("3");
    });

    it("should handle $gte operator", () => {
      const entry1 = { id: "1", amount: 50 };
      const entry2 = { id: "2", amount: 100 };
      const entry3 = { id: "3", amount: 150 };

      cache.registerEntry.insert(entry1 as any);
      cache.registerEntry.insert(entry2 as any);
      cache.registerEntry.insert(entry3 as any);

      const result = cache.registerEntry.find({
        amount: { $gte: 100 },
      });

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toContain("2");
      expect(result.map((r) => r.id)).toContain("3");
    });

    it("should handle $in operator", () => {
      const entry1 = { id: "1", amount: 50 };
      const entry2 = { id: "2", amount: 100 };
      const entry3 = { id: "3", amount: 150 };

      cache.registerEntry.insert(entry1 as any);
      cache.registerEntry.insert(entry2 as any);
      cache.registerEntry.insert(entry3 as any);

      const result = cache.registerEntry.find({
        amount: { $in: [50, 150] },
      });

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toContain("1");
      expect(result.map((r) => r.id)).toContain("3");
    });

    it("should handle $nin operator", () => {
      const entry1 = { id: "1", amount: 50 };
      const entry2 = { id: "2", amount: 100 };
      const entry3 = { id: "3", amount: 150 };

      cache.registerEntry.insert(entry1 as any);
      cache.registerEntry.insert(entry2 as any);
      cache.registerEntry.insert(entry3 as any);

      const result = cache.registerEntry.find({
        amount: { $nin: [50, 150] },
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2");
    });

    it("should handle $and operator", () => {
      const entry1 = { id: "1", amount: 100, description: "Test1" };
      const entry2 = { id: "2", amount: 100, description: "Test2" };
      const entry3 = { id: "3", amount: 200, description: "Test1" };

      cache.registerEntry.insert(entry1 as any);
      cache.registerEntry.insert(entry2 as any);
      cache.registerEntry.insert(entry3 as any);

      const result = cache.registerEntry.find({
        $and: [{ amount: 100 }, { description: "Test1" }],
      } as any);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("should handle $or operator", () => {
      const entry1 = { id: "1", amount: 100 };
      const entry2 = { id: "2", amount: 200 };
      const entry3 = { id: "3", amount: 300 };

      cache.registerEntry.insert(entry1 as any);
      cache.registerEntry.insert(entry2 as any);
      cache.registerEntry.insert(entry3 as any);

      const result = cache.registerEntry.find({
        $or: [{ amount: 100 }, { amount: 300 }],
      } as any);

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toContain("1");
      expect(result.map((r) => r.id)).toContain("3");
    });

    it("should handle nested $and and $or operators", () => {
      const entry1 = { id: "1", amount: 100, description: "A" };
      const entry2 = { id: "2", amount: 200, description: "B" };
      const entry3 = { id: "3", amount: 300, description: "A" };

      cache.registerEntry.insert(entry1 as any);
      cache.registerEntry.insert(entry2 as any);
      cache.registerEntry.insert(entry3 as any);

      const result = cache.registerEntry.find({
        $and: [
          { amount: { $gt: 50 } },
          {
            $or: [{ description: "A" }, { amount: { $gt: 250 } }],
          },
        ],
      } as any);

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toContain("1");
      expect(result.map((r) => r.id)).toContain("3");
    });
  });

  describe("Index Management", () => {
    it("should handle index creation and updates", () => {
      const entry1 = { id: "1", amount: 100 };
      const entry2 = { id: "2", amount: 200 };

      cache.registerEntry.insert(entry1 as any);
      cache.registerEntry.insert(entry2 as any);

      // Create index
      cache.registerEntry.createIndex("amount");

      // Update entry
      const updatedEntry = { id: "1", amount: 150 };
      cache.registerEntry.update(updatedEntry as any);

      // Find using index
      const result = cache.registerEntry.find({ amount: 150 });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("should handle index removal", () => {
      const entry1 = { id: "1", amount: 100 };
      const entry2 = { id: "2", amount: 200 };

      cache.registerEntry.insert(entry1 as any);
      cache.registerEntry.insert(entry2 as any);

      // Create index
      cache.registerEntry.createIndex("amount");

      // Remove entry
      cache.registerEntry.remove({ id: "1" });

      // Verify index is updated
      const result = cache.registerEntry.find({ amount: 100 });
      expect(result).toHaveLength(0);
    });

    it("should handle multiple indexes", () => {
      const entry1 = { id: "1", amount: 100, description: "A" };
      const entry2 = { id: "2", amount: 200, description: "B" };

      cache.registerEntry.insert(entry1 as any);
      cache.registerEntry.insert(entry2 as any);

      // Create multiple indexes
      cache.registerEntry.createIndex("amount");
      cache.registerEntry.createIndex("description");

      // Query using different indexes
      const amountResult = cache.registerEntry.find({ amount: 100 });
      const descResult = cache.registerEntry.find({ description: "B" });

      expect(amountResult).toHaveLength(1);
      expect(descResult).toHaveLength(1);
      expect(amountResult[0].id).toBe("1");
      expect(descResult[0].id).toBe("2");
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid query operators gracefully", () => {
      const entry = { id: "1", amount: 100 };
      cache.registerEntry.insert(entry as any);

      // Invalid operator should fall back to exact match
      const result = cache.registerEntry.find({
        amount: { $invalid: 100 },
      });

      expect(result).toHaveLength(0);
    });

    it("should handle null/undefined values in queries", () => {
      const entry = { id: "1", amount: 100 };
      cache.registerEntry.insert(entry as any);

      const result = cache.registerEntry.find({
        amount: null,
      });

      expect(result).toHaveLength(0);
    });

    it("should handle empty query objects", () => {
      const entry = { id: "1", amount: 100 };
      cache.registerEntry.insert(entry as any);

      const result = cache.registerEntry.find({});
      expect(result).toHaveLength(1);
    });

    it("should handle function queries", () => {
      const entry1 = { id: "1", amount: 100 };
      const entry2 = { id: "2", amount: 200 };
      const entry3 = { id: "3", amount: 300 };

      cache.registerEntry.insert(entry1 as any);
      cache.registerEntry.insert(entry2 as any);
      cache.registerEntry.insert(entry3 as any);

      const result = cache.registerEntry.find((item: any) => item.amount > 150);
      expect(result).toHaveLength(2);
      expect(result.map((r: any) => r.id)).toContain("2");
      expect(result.map((r: any) => r.id)).toContain("3");
    });
  });
});
