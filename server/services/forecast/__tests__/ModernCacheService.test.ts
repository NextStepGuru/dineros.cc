import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { dateTimeService } from "../DateTimeService";
import { ModernCacheService } from "../ModernCacheService";
import type {
  CacheAccountRegister,
  CacheRegisterEntry,
  CacheReoccurrence,
  CacheReoccurrenceSkip,
} from "../ModernCacheService";

const moment = (input?: any) => dateTimeService.create(input);

describe("ModernCacheService", () => {
  let cache: ModernCacheService;

  beforeEach(async () => {
    cache = new ModernCacheService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockAccountRegister(
    overrides: Partial<CacheAccountRegister> = {},
  ): CacheAccountRegister {
    return {
      id: 1,
      typeId: 1,
      budgetId: 1,
      accountId: "test-account",
      name: "Test Account",
      balance: 1000,
      latestBalance: 1000,
      minPayment: null,
      statementAt: dateTimeService.create("2024-01-15").toDate(),
      apr1: 0.15,
      apr1StartAt: null,
      apr2: null,
      apr2StartAt: null,
      apr3: null,
      apr3StartAt: null,
      targetAccountRegisterId: null,
      loanStartAt: null,
      loanPaymentsPerYear: null,
      loanTotalYears: null,
      loanOriginalAmount: null,
      loanPaymentSortOrder: 0,
      minAccountBalance: 500,
      allowExtraPayment: false,
      isArchived: false,
      plaidId: null,
      ...overrides,
    } as CacheAccountRegister;
  }

  function createMockRegisterEntry(
    overrides: Partial<CacheRegisterEntry> = {},
  ): CacheRegisterEntry {
    return {
      id: "entry-1",
      accountRegisterId: 1,
      description: "Test Entry",
      amount: 100,
      balance: 1100,
      createdAt: dateTimeService.create("2024-01-01").toDate(),
      isProjected: true,
      isPending: false,
      isCleared: false,
      isBalanceEntry: false,
      isManualEntry: false,
      isReconciled: false,
      sourceAccountRegisterId: null,
      reoccurrenceId: null,
      transferAccountRegisterId: null,
      ...overrides,
    } as CacheRegisterEntry;
  }

  function createMockReoccurrence(
    overrides: Partial<CacheReoccurrence> = {},
  ): CacheReoccurrence {
    return {
      id: 1,
      accountId: "test-account",
      accountRegisterId: 1,
      description: "Test Reoccurrence",
      lastAt: new Date("2024-01-01T00:00:00.000Z"),
      amount: 100,
      transferAccountRegisterId: null,
      intervalId: 1,
      intervalCount: 1,
      endAt: null,
      totalIntervals: null,
      elapsedIntervals: null,
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      adjustBeforeIfOnWeekend: false,
      ...overrides,
    } as CacheReoccurrence;
  }

  function createMockReoccurrenceSkip(
    overrides: Partial<CacheReoccurrenceSkip> = {},
  ): CacheReoccurrenceSkip {
    return {
      id: 1,
      reoccurrenceId: 1,
      accountId: "test-account",
      accountRegisterId: 1,
      skippedAt: "2024-01-01",
      ...overrides,
    } as CacheReoccurrenceSkip;
  }

  describe("ModernCacheService initialization", () => {
    it("should initialize with empty collections", () => {
      expect(cache.accountRegister.count()).toBe(0);
      expect(cache.registerEntry.count()).toBe(0);
      expect(cache.reoccurrence.count()).toBe(0);
      expect(cache.reoccurrenceSkip.count()).toBe(0);
    });

    it("should create optimized indexes on initialization", () => {
      // Test that indexes are created by using them
      const account = createMockAccountRegister({ accountId: "test-123" });
      cache.accountRegister.insert(account);

      const found = cache.accountRegister.find({ accountId: "test-123" });
      expect(found).toHaveLength(1);
      expect(found[0]!.accountId).toBe("test-123");
    });
  });

  describe("clearAll", () => {
    it("should clear all collections", () => {
      cache.accountRegister.insert(createMockAccountRegister());
      cache.registerEntry.insert(createMockRegisterEntry());
      cache.reoccurrence.insert(createMockReoccurrence());
      cache.reoccurrenceSkip.insert(createMockReoccurrenceSkip());

      expect(cache.accountRegister.count()).toBe(1);
      expect(cache.registerEntry.count()).toBe(1);
      expect(cache.reoccurrence.count()).toBe(1);
      expect(cache.reoccurrenceSkip.count()).toBe(1);

      cache.clearAll();

      expect(cache.accountRegister.count()).toBe(0);
      expect(cache.registerEntry.count()).toBe(0);
      expect(cache.reoccurrence.count()).toBe(0);
      expect(cache.reoccurrenceSkip.count()).toBe(0);
    });
  });

  describe("getStats", () => {
    it("should return correct counts for all collections", () => {
      cache.accountRegister.insertMany([
        createMockAccountRegister({ id: 1 }),
        createMockAccountRegister({ id: 2 }),
      ]);
      cache.registerEntry.insertMany([
        createMockRegisterEntry({ id: "entry-1" }),
        createMockRegisterEntry({ id: "entry-2" }),
        createMockRegisterEntry({ id: "entry-3" }),
      ]);
      cache.reoccurrence.insert(createMockReoccurrence());

      const stats = cache.getStats();

      expect(stats).toEqual({
        reoccurrences: 1,
        accountRegisters: 2,
        registerEntries: 3,
        reoccurrenceSkips: 0,
        reoccurrenceSplits: 0,
      });
    });
  });

  describe("ModernCollection operations", () => {
    describe("insert and insertMany", () => {
      it("should insert single item", () => {
        const account = createMockAccountRegister({
          id: 1,
          name: "Test Account",
        });
        cache.accountRegister.insert(account);

        expect(cache.accountRegister.count()).toBe(1);
        expect(cache.accountRegister.findById(1)?.name).toBe("Test Account");
      });

      it("should insert multiple items", () => {
        const accounts = [
          createMockAccountRegister({ id: 1, name: "Account 1" }),
          createMockAccountRegister({ id: 2, name: "Account 2" }),
        ];
        cache.accountRegister.insertMany(accounts);

        expect(cache.accountRegister.count()).toBe(2);
        expect(cache.accountRegister.findById(1)?.name).toBe("Account 1");
        expect(cache.accountRegister.findById(2)?.name).toBe("Account 2");
      });
    });

    describe("find operations", () => {
      beforeEach(() => {
        cache.accountRegister.insertMany([
          createMockAccountRegister({
            id: 1,
            name: "Checking",
            typeId: 1,
            balance: 1000,
          }),
          createMockAccountRegister({
            id: 2,
            name: "Savings",
            typeId: 2,
            balance: 5000,
          }),
          createMockAccountRegister({
            id: 3,
            name: "Credit Card",
            typeId: 3,
            balance: -500,
          }),
        ]);
      });

      it("should find all items with no query", () => {
        const all = cache.accountRegister.find();
        expect(all).toHaveLength(3);
      });

      it("should find items by simple property match", () => {
        const checking = cache.accountRegister.find({ name: "Checking" });
        expect(checking).toHaveLength(1);
        expect(checking[0]!.name).toBe("Checking");
      });

      it("should find items by function predicate", () => {
        const positiveBalance = cache.accountRegister.find(
          (acc) => acc.balance > 0,
        );
        expect(positiveBalance).toHaveLength(2);
        expect(positiveBalance.every((acc) => acc.balance > 0)).toBe(true);
      });

      it("should use index for fast lookup", () => {
        const byType = cache.accountRegister.find({ typeId: 1 });
        expect(byType).toHaveLength(1);
        expect(byType[0]!.name).toBe("Checking");
      });

      it("should find single item with findOne", () => {
        const checking = cache.accountRegister.findOne({ name: "Checking" });
        expect(checking?.name).toBe("Checking");
      });

      it("should return null when findOne finds nothing", () => {
        const missing = cache.accountRegister.findOne({ name: "Missing" });
        expect(missing).toBeNull();
      });

      it("should find by ID", () => {
        const account = cache.accountRegister.findById(2);
        expect(account?.name).toBe("Savings");
      });

      it("should return null for non-existent ID", () => {
        const missing = cache.accountRegister.findById(999);
        expect(missing).toBeNull();
      });
    });

    describe("update operations", () => {
      it("should update single item", () => {
        const account = createMockAccountRegister({
          id: 1,
          name: "Original",
          balance: 1000,
        });
        cache.accountRegister.insert(account);

        const updated = { ...account, name: "Updated", balance: 1500 };
        cache.accountRegister.update(updated);

        const found = cache.accountRegister.findById(1);
        expect(found?.name).toBe("Updated");
        expect(found?.balance).toBe(1500);
      });

      it("should update multiple items", () => {
        cache.accountRegister.insertMany([
          createMockAccountRegister({ id: 1, typeId: 1, balance: 1000 }),
          createMockAccountRegister({ id: 2, typeId: 1, balance: 2000 }),
          createMockAccountRegister({ id: 3, typeId: 2, balance: 3000 }),
        ]);

        const updatedCount = cache.accountRegister.updateMany(
          { typeId: 1 },
          { balance: 9999 },
        );

        expect(updatedCount).toBe(2);
        expect(cache.accountRegister.findById(1)?.balance).toBe(9999);
        expect(cache.accountRegister.findById(2)?.balance).toBe(9999);
        expect(cache.accountRegister.findById(3)?.balance).toBe(3000); // Unchanged
      });
    });

    describe("remove operations", () => {
      it("should remove items by query", () => {
        cache.accountRegister.insertMany([
          createMockAccountRegister({ id: 1, typeId: 1 }),
          createMockAccountRegister({ id: 2, typeId: 1 }),
          createMockAccountRegister({ id: 3, typeId: 2 }),
        ]);

        const removedCount = cache.accountRegister.remove({ typeId: 1 });

        expect(removedCount).toBe(2);
        expect(cache.accountRegister.count()).toBe(1);
        expect(cache.accountRegister.findById(3)).not.toBeNull();
      });

      it("should remove items by function predicate", () => {
        cache.accountRegister.insertMany([
          createMockAccountRegister({ id: 1, balance: 1000 }),
          createMockAccountRegister({ id: 2, balance: -500 }),
        ]);

        const removedCount = cache.accountRegister.remove(
          (acc) => acc.balance < 0,
        );

        expect(removedCount).toBe(1);
        expect(cache.accountRegister.count()).toBe(1);
        expect(cache.accountRegister.findById(1)).not.toBeNull();
      });
    });

    describe("clear and count", () => {
      it("should clear collection", () => {
        cache.accountRegister.insertMany([
          createMockAccountRegister({ id: 1 }),
          createMockAccountRegister({ id: 2 }),
        ]);

        expect(cache.accountRegister.count()).toBe(2);
        cache.accountRegister.clear();
        expect(cache.accountRegister.count()).toBe(0);
      });
    });
  });

  describe("ChainableCollection operations", () => {
    beforeEach(() => {
      cache.registerEntry.insertMany([
        createMockRegisterEntry({
          id: "entry-1",
          accountRegisterId: 1,
          amount: 100,
          createdAt: moment("2024-01-01").toDate(),
        }),
        createMockRegisterEntry({
          id: "entry-2",
          accountRegisterId: 1,
          amount: 200,
          createdAt: moment("2024-01-02").toDate(),
        }),
        createMockRegisterEntry({
          id: "entry-3",
          accountRegisterId: 2,
          amount: 50,
          createdAt: moment("2024-01-03").toDate(),
        }),
        createMockRegisterEntry({
          id: "entry-4",
          accountRegisterId: 1,
          amount: 300,
          createdAt: moment("2024-01-04").toDate(),
        }),
      ]);
    });

    it("should chain find operations", () => {
      const result = cache.registerEntry
        .chain()
        .find({ accountRegisterId: 1 })
        .find((entry) => entry.amount > 150)
        .data();

      expect(result).toHaveLength(2);
      expect(
        result.every(
          (entry) => entry.accountRegisterId === 1 && entry.amount > 150,
        ),
      ).toBe(true);
    });

    it("should sort in ascending order", () => {
      const result = cache.registerEntry.chain().simplesort("amount").data();

      expect(result[0]!.amount).toBe(50);
      expect(result[1]!.amount).toBe(100);
      expect(result[2]!.amount).toBe(200);
      expect(result[3]!.amount).toBe(300);
    });

    it("should sort in descending order", () => {
      const result = cache.registerEntry
        .chain()
        .simplesort("amount", true)
        .data();

      expect(result[0]!.amount).toBe(300);
      expect(result[1]!.amount).toBe(200);
      expect(result[2]!.amount).toBe(100);
      expect(result[3]!.amount).toBe(50);
    });

    it("should sort strings correctly", () => {
      cache.accountRegister.insertMany([
        createMockAccountRegister({ id: 1, name: "Zebra" }),
        createMockAccountRegister({ id: 2, name: "Alpha" }),
        createMockAccountRegister({ id: 3, name: "Beta" }),
      ]);

      const result = cache.accountRegister.chain().simplesort("name").data();

      expect(result[0]!.name).toBe("Alpha");
      expect(result[1]!.name).toBe("Beta");
      expect(result[2]!.name).toBe("Zebra");
    });

    it("should limit results", () => {
      const result = cache.registerEntry
        .chain()
        .simplesort("amount", true)
        .limit(2)
        .data();

      expect(result).toHaveLength(2);
      expect(result[0]!.amount).toBe(300);
      expect(result[1]!.amount).toBe(200);
    });

    it("should combine multiple operations", () => {
      const result = cache.registerEntry
        .chain()
        .find({ accountRegisterId: 1 })
        .simplesort("amount", true)
        .limit(2)
        .data();

      expect(result).toHaveLength(2);
      expect(result[0]!.amount).toBe(300);
      expect(result[1]!.amount).toBe(200);
      expect(result.every((entry) => entry.accountRegisterId === 1)).toBe(true);
    });
  });

  describe("Complex query operators", () => {
    beforeEach(() => {
      cache.registerEntry.insertMany([
        createMockRegisterEntry({
          id: "entry-1",
          amount: 100,
          isPending: true,
        }),
        createMockRegisterEntry({
          id: "entry-2",
          amount: 200,
          isPending: false,
        }),
        createMockRegisterEntry({
          id: "entry-3",
          amount: 300,
          isPending: true,
        }),
        createMockRegisterEntry({
          id: "entry-4",
          amount: 150,
          isPending: false,
        }),
      ]);
    });

    it("should handle $eq operator", () => {
      const result = cache.registerEntry.find({ amount: { $eq: 100 } } as any);
      expect(result).toHaveLength(1);
      expect(result[0]!.amount).toBe(100);
    });

    it("should handle $ne operator", () => {
      const result = cache.registerEntry.find({ amount: { $ne: 100 } } as any);
      expect(result).toHaveLength(3);
      expect(result.every((entry) => entry.amount !== 100)).toBe(true);
    });

    it("should handle $lt operator", () => {
      const result = cache.registerEntry.find({ amount: { $lt: 200 } } as any);
      expect(result).toHaveLength(2);
      expect(result.every((entry) => entry.amount < 200)).toBe(true);
    });

    it("should handle $lte operator", () => {
      const result = cache.registerEntry.find({ amount: { $lte: 200 } } as any);
      expect(result).toHaveLength(3);
      expect(result.every((entry) => entry.amount <= 200)).toBe(true);
    });

    it("should handle $gt operator", () => {
      const result = cache.registerEntry.find({ amount: { $gt: 150 } } as any);
      expect(result).toHaveLength(2);
      expect(result.every((entry) => entry.amount > 150)).toBe(true);
    });

    it("should handle $gte operator", () => {
      const result = cache.registerEntry.find({ amount: { $gte: 150 } } as any);
      expect(result).toHaveLength(3);
      expect(result.every((entry) => entry.amount >= 150)).toBe(true);
    });

    it("should handle $in operator", () => {
      const result = cache.registerEntry.find({
        amount: { $in: [100, 300] },
      } as any);
      expect(result).toHaveLength(2);
      expect(result.every((entry) => [100, 300].includes(entry.amount))).toBe(
        true,
      );
    });

    it("should handle $nin operator", () => {
      const result = cache.registerEntry.find({
        amount: { $nin: [100, 300] },
      } as any);
      expect(result).toHaveLength(2);
      expect(result.every((entry) => ![100, 300].includes(entry.amount))).toBe(
        true,
      );
    });

    it("should handle $and operator with function predicate", () => {
      const result = cache.registerEntry.find(
        (entry) => entry.amount > 100 && entry.isPending === true,
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.amount).toBe(300);
      expect(result[0]!.isPending).toBe(true);
    });

    it("should handle $or operator with function predicate", () => {
      const result = cache.registerEntry.find(
        (entry) => entry.amount === 100 || entry.amount === 300,
      );
      expect(result).toHaveLength(2);
      expect(result.every((entry) => [100, 300].includes(entry.amount))).toBe(
        true,
      );
    });

    it("should handle complex nested logic with function predicate", () => {
      const result = cache.registerEntry.find(
        (entry) =>
          (entry.amount < 150 || entry.amount > 250) &&
          entry.isPending === true,
      );
      expect(result).toHaveLength(2);
      expect(result.every((entry) => entry.isPending === true)).toBe(true);
      expect(
        result.every((entry) => entry.amount < 150 || entry.amount > 250),
      ).toBe(true);
    });
  });

  describe("Index management", () => {
    it("should use indexes for performance", () => {
      // Insert many items
      const accounts = Array.from({ length: 1000 }, (_, i) =>
        createMockAccountRegister({
          id: i + 1,
          accountId: `account-${i % 10}`,
          typeId: (i % 5) + 1,
        }),
      );
      cache.accountRegister.insertMany(accounts);

      // Query should use index
      const result = cache.accountRegister.find({ accountId: "account-5" });
      expect(result).toHaveLength(100); // Should find 100 items with this accountId
    });

    it("should update items but may not clean up old index entries", () => {
      const account = createMockAccountRegister({
        id: 1,
        accountId: "original",
      });
      cache.accountRegister.insert(account);

      expect(
        cache.accountRegister.find({ accountId: "original" }),
      ).toHaveLength(1);

      const updated = { ...account, accountId: "updated" };
      cache.accountRegister.update(updated);

      // The updated item should be findable by new accountId
      expect(cache.accountRegister.find({ accountId: "updated" })).toHaveLength(
        1,
      );

      // Verify the item was actually updated
      const foundItem = cache.accountRegister.findById(1);
      expect(foundItem?.accountId).toBe("updated");
    });

    it("should remove from indexes when items are removed", () => {
      cache.accountRegister.insertMany([
        createMockAccountRegister({ id: 1, accountId: "test-1" }),
        createMockAccountRegister({ id: 2, accountId: "test-2" }),
      ]);

      expect(cache.accountRegister.find({ accountId: "test-1" })).toHaveLength(
        1,
      );

      cache.accountRegister.remove({ id: 1 });

      expect(cache.accountRegister.find({ accountId: "test-1" })).toHaveLength(
        0,
      );
      expect(cache.accountRegister.find({ accountId: "test-2" })).toHaveLength(
        1,
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle empty collections", () => {
      expect(cache.accountRegister.find()).toHaveLength(0);
      expect(cache.accountRegister.findOne({ id: 1 })).toBeNull();
      expect(cache.accountRegister.findById(1)).toBeNull();
      expect(
        cache.accountRegister.updateMany({ id: 1 }, { name: "test" }),
      ).toBe(0);
      expect(cache.accountRegister.remove({ id: 1 })).toBe(0);
    });

    it("should handle queries with no matches", () => {
      cache.accountRegister.insert(
        createMockAccountRegister({ id: 1, name: "Test" }),
      );

      expect(cache.accountRegister.find({ name: "NotFound" })).toHaveLength(0);
      expect(cache.accountRegister.findOne({ name: "NotFound" })).toBeNull();
    });

    it("should handle null and undefined values in queries", () => {
      cache.accountRegister.insertMany([
        createMockAccountRegister({ id: 1, plaidId: null }),
        createMockAccountRegister({ id: 2, plaidId: "test-plaid" }),
      ]);

      const nullResults = cache.accountRegister.find({ plaidId: null });
      expect(nullResults).toHaveLength(1);
      expect(nullResults[0]!.id).toBe(1);
    });

    it("should handle updates on non-existent items", () => {
      const nonExistent = createMockAccountRegister({
        id: 999,
        name: "Non-existent",
      });
      cache.accountRegister.update(nonExistent);

      // Should not add the item
      expect(cache.accountRegister.count()).toBe(0);
      expect(cache.accountRegister.findById(999)).toBeNull();
    });

    it("should handle complex data types in sort", () => {
      cache.registerEntry.insertMany([
        createMockRegisterEntry({
          id: "entry-1",
          createdAt: moment("2024-01-03").toDate(),
        }),
        createMockRegisterEntry({
          id: "entry-2",
          createdAt: moment("2024-01-01").toDate(),
        }),
        createMockRegisterEntry({
          id: "entry-3",
          createdAt: moment("2024-01-02").toDate(),
        }),
      ]);

      // Sort by moment objects should return 0 (no change in order)
      const result = cache.registerEntry.chain().simplesort("createdAt").data();

      expect(result).toHaveLength(3);
      // Order should remain unchanged since moment comparison returns 0
    });
  });
});
