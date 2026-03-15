/* eslint-disable no-unused-vars */
import type { Decimal } from "@prisma/client/runtime/library";
import type { Moment } from "moment";

// Type-safe data structures
export type CacheReoccurrence = {
  id: number;
  accountId: string;
  accountRegisterId: number;
  intervalId: number;
  intervalName?: string;
  transferAccountRegisterId: number | null;
  intervalCount: number;
  lastAt: Date | null;
  /** Last occurrence date on or before "now" (for display/persist; respects interval) */
  lastRunAt?: Date | null;
  endAt: Date | null;
  amount: number;
  description: string;
  totalIntervals: number | null;
  elapsedIntervals: number | null;
  updatedAt: Date;
  adjustBeforeIfOnWeekend: boolean;
};

export type CacheAccountRegister = {
  id: number;
  typeId: number;
  budgetId: number;
  accountId: string;
  name: string;
  balance: number;
  latestBalance: number;
  minPayment: number | null | undefined | Decimal;
  statementAt: string | Date;
  statementIntervalId: number;
  apr1: number | null | undefined | Decimal;
  apr1StartAt: Date | null;
  apr2: number | null | undefined | Decimal;
  apr2StartAt: Date | null;
  apr3: number | null | undefined | Decimal;
  apr3StartAt: Date | null;
  targetAccountRegisterId: number | null;
  loanStartAt: Date | null;
  loanPaymentsPerYear: number | null | undefined | Decimal;
  loanTotalYears: number | null | undefined | Decimal;
  loanOriginalAmount: number | null | undefined | Decimal;
  loanPaymentSortOrder: number;
  savingsGoalSortOrder: number;
  accountSavingsGoal: number | null;
  minAccountBalance: number | Decimal;
  allowExtraPayment: boolean;
  isArchived: boolean;
  plaidId: string | null;
};

export type CacheRegisterEntry = {
  id: string;
  seq: number | null;
  accountRegisterId: number;
  sourceAccountRegisterId: number | null;
  createdAt: Moment;
  description: string;
  reoccurrenceId: number | null;
  amount: number;
  balance: number;
  typeId: number | null;
  isBalanceEntry: boolean;
  isPending: boolean;
  isCleared: boolean;
  isProjected: boolean;
  isManualEntry: boolean;
  isReconciled: boolean;
};

export type CacheReoccurrenceSkip = {
  id: number;
  reoccurrenceId: number;
  accountId: string;
  accountRegisterId: number;
  skippedAt: string;
};

// Modern collection interface
interface Collection<T> {
  insert(item: T): void;
  insertMany(items: T[]): void;
  find(query?: Partial<T> | ((item: T) => boolean)): T[];
  findOne(query: Partial<T> | ((item: T) => boolean)): T | null;
  findById(id: number | string): T | null;
  update(item: T): void;
  updateMany(query: Partial<T>, updates: Partial<T>): number;
  remove(query: Partial<T> | ((item: T) => boolean)): number;
  clear(): void;
  count(): number;
  chain(): ChainableCollection<T>;
}

// Chainable operations for complex queries
class ChainableCollection<T> {
  constructor(private items: T[]) {}

  find(query: Partial<T> | ((item: T) => boolean)): ChainableCollection<T> {
    const filtered = this.items.filter((item) =>
      typeof query === "function" ? query(item) : this.matchesQuery(item, query)
    );
    return new ChainableCollection(filtered);
  }

  simplesort<K extends keyof T>(
    field: K,
    descending = false
  ): ChainableCollection<T> {
    const sorted = [...this.items].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      if (typeof aVal === "number" && typeof bVal === "number") {
        return descending ? bVal - aVal : aVal - bVal;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return descending ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }

      return 0;
    });

    return new ChainableCollection(sorted);
  }

  limit(count: number): ChainableCollection<T> {
    return new ChainableCollection(this.items.slice(0, count));
  }

  data(): T[] {
    return this.items;
  }

  private matchesQuery(item: T, query: Partial<T>): boolean {
    // Handle top-level $and and $or operators
    if ("$and" in query) {
      return (query as any).$and.every((condition: any) =>
        this.matchesQuery(item, condition)
      );
    }
    if ("$or" in query) {
      return (query as any).$or.some((condition: any) =>
        this.matchesQuery(item, condition)
      );
    }

    return Object.entries(query).every(([key, value]) => {
      const itemValue = (item as any)[key];

      // Handle complex query operators
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const operators = value as any;

        if ("$eq" in operators) return itemValue === operators.$eq;
        if ("$ne" in operators) return itemValue !== operators.$ne;
        if ("$lt" in operators) return itemValue < operators.$lt;
        if ("$lte" in operators) return itemValue <= operators.$lte;
        if ("$gt" in operators) return itemValue > operators.$gt;
        if ("$gte" in operators) return itemValue >= operators.$gte;
        if ("$in" in operators) return operators.$in.includes(itemValue);
        if ("$nin" in operators) return !operators.$nin.includes(itemValue);
      }

      return itemValue === value;
    });
  }
}

// Efficient collection implementation using Maps for fast lookups
class ModernCollection<T extends { id: number | string }>
  implements Collection<T>
{
  private items = new Map<number | string, T>();
  private indexes = new Map<string, Map<any, Set<number | string>>>();

  constructor(
    private getIdField: (item: T) => number | string = (item) => item.id
  ) {}

  // Create index for fast querying
  createIndex(field: keyof T): void {
    if (!this.indexes.has(field as string)) {
      this.indexes.set(field as string, new Map());
    }

    // Rebuild index
    const index = this.indexes.get(field as string)!;
    index.clear();

    for (const [id, item] of this.items) {
      const value = item[field];
      if (!index.has(value)) {
        index.set(value, new Set());
      }
      index.get(value)!.add(id);
    }
  }

  insert(item: T): void {
    const id = this.getIdField(item);
    this.items.set(id, item);
    this.updateIndexes(item);
  }

  insertMany(items: T[]): void {
    items.forEach((item) => this.insert(item));
  }

  find(query?: Partial<T> | ((item: T) => boolean)): T[] {
    if (!query) {
      return Array.from(this.items.values());
    }

    if (typeof query === "function") {
      return Array.from(this.items.values()).filter(query);
    }

    // Try to use indexes for faster queries
    const entries = Object.entries(query);
    if (entries.length === 1) {
      const firstEntry = entries[0];
      if (!firstEntry) return [];
      const [field, value] = firstEntry;
      const index = this.indexes.get(field);
      if (index && typeof value !== "object") {
        const ids = index.get(value) || new Set();
        return Array.from(ids)
          .map((id) => this.items.get(id)!)
          .filter(Boolean);
      }
    }

    // Fallback to linear search with query matching
    return Array.from(this.items.values()).filter((item) =>
      this.matchesQuery(item, query)
    );
  }

  findOne(query: Partial<T> | ((item: T) => boolean)): T | null {
    const results = this.find(query);
    return results.length > 0 ? (results[0] ?? null) : null;
  }

  findById(id: number | string): T | null {
    return this.items.get(id) || null;
  }

  update(item: T): void {
    const id = this.getIdField(item);
    if (this.items.has(id)) {
      this.items.set(id, item);
      this.updateIndexes(item);
    }
  }

  updateMany(query: Partial<T>, updates: Partial<T>): number {
    const itemsToUpdate = this.find(query);
    itemsToUpdate.forEach((item) => {
      const updated = { ...item, ...updates };
      this.update(updated);
    });
    return itemsToUpdate.length;
  }

  remove(query: Partial<T> | ((item: T) => boolean)): number {
    const itemsToRemove = this.find(query);
    itemsToRemove.forEach((item) => {
      const id = this.getIdField(item);
      this.items.delete(id);
      this.removeFromIndexes(item);
    });
    return itemsToRemove.length;
  }

  clear(): void {
    this.items.clear();
    this.indexes.forEach((index) => index.clear());
  }

  count(): number {
    return this.items.size;
  }

  chain(): ChainableCollection<T> {
    return new ChainableCollection(Array.from(this.items.values()));
  }

  private matchesQuery(item: T, query: Partial<T>): boolean {
    // Handle top-level $and and $or operators
    if ("$and" in query) {
      return (query as any).$and.every((condition: any) =>
        this.matchesQuery(item, condition)
      );
    }
    if ("$or" in query) {
      return (query as any).$or.some((condition: any) =>
        this.matchesQuery(item, condition)
      );
    }

    return Object.entries(query).every(([key, value]) => {
      const itemValue = (item as any)[key];

      // Handle complex query operators (same as ChainableCollection)
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const operators = value as any;

        if ("$eq" in operators) return itemValue === operators.$eq;
        if ("$ne" in operators) return itemValue !== operators.$ne;
        if ("$lt" in operators) return itemValue < operators.$lt;
        if ("$lte" in operators) return itemValue <= operators.$lte;
        if ("$gt" in operators) return itemValue > operators.$gt;
        if ("$gte" in operators) return itemValue >= operators.$gte;
        if ("$in" in operators) return operators.$in.includes(itemValue);
        if ("$nin" in operators) return !operators.$nin.includes(itemValue);
      }

      return itemValue === value;
    });
  }

  private updateIndexes(item: T): void {
    for (const [field, index] of this.indexes) {
      const value = (item as any)[field];
      const id = this.getIdField(item);

      if (!index.has(value)) {
        index.set(value, new Set());
      }
      index.get(value)!.add(id);
    }
  }

  private removeFromIndexes(item: T): void {
    for (const [field, index] of this.indexes) {
      const value = (item as any)[field];
      const id = this.getIdField(item);

      if (index.has(value)) {
        index.get(value)!.delete(id);
        if (index.get(value)!.size === 0) {
          index.delete(value);
        }
      }
    }
  }
}

// Modern cache service with type safety and performance
export class ModernCacheService {
  public readonly reoccurrence: Collection<CacheReoccurrence>;
  public readonly accountRegister: Collection<CacheAccountRegister>;
  public readonly registerEntry: Collection<CacheRegisterEntry>;
  public readonly reoccurrenceSkip: Collection<CacheReoccurrenceSkip>;

  constructor() {
    this.reoccurrence = new ModernCollection<CacheReoccurrence>();
    this.accountRegister = new ModernCollection<CacheAccountRegister>();
    this.registerEntry = new ModernCollection<CacheRegisterEntry>(
      (item) => item.id
    );
    this.reoccurrenceSkip = new ModernCollection<CacheReoccurrenceSkip>();

    // Create indexes for commonly queried fields
    this.createOptimizedIndexes();
  }

  private createOptimizedIndexes(): void {
    // Account register indexes
    const accountRegisterCollection = this
      .accountRegister as ModernCollection<CacheAccountRegister>;
    accountRegisterCollection.createIndex("accountId");
    accountRegisterCollection.createIndex("typeId");
    accountRegisterCollection.createIndex("targetAccountRegisterId");

    // Register entry indexes
    const registerEntryCollection = this
      .registerEntry as ModernCollection<CacheRegisterEntry>;
    registerEntryCollection.createIndex("accountRegisterId");
    registerEntryCollection.createIndex("reoccurrenceId");
    registerEntryCollection.createIndex("isProjected");
    registerEntryCollection.createIndex("isPending");

    // Reoccurrence indexes
    const reoccurrenceCollection = this
      .reoccurrence as ModernCollection<CacheReoccurrence>;
    reoccurrenceCollection.createIndex("accountId");
    reoccurrenceCollection.createIndex("accountRegisterId");
  }

  // Utility methods for common operations
  clearAll(): void {
    this.reoccurrence.clear();
    this.accountRegister.clear();
    this.registerEntry.clear();
    this.reoccurrenceSkip.clear();
  }

  getStats(): {
    reoccurrences: number;
    accountRegisters: number;
    registerEntries: number;
    reoccurrenceSkips: number;
  } {
    return {
      reoccurrences: this.reoccurrence.count(),
      accountRegisters: this.accountRegister.count(),
      registerEntries: this.registerEntry.count(),
      reoccurrenceSkips: this.reoccurrenceSkip.count(),
    };
  }
}

export default ModernCacheService;
