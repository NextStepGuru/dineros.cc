import type { PrismaClient } from '~/types/test-types';
import { vi } from 'vitest';

const FIXED_TEST_DATE = new Date('2024-01-01T00:00:00.000Z');
const FIXED_TEST_ISO = FIXED_TEST_DATE.toISOString();
let nextSyntheticId = 1;

// Mock test database setup
export async function createTestDatabase(): Promise<PrismaClient> {
  nextSyntheticId = 1;
  // In a real implementation, this would set up a test database
  // For now, we'll return a mock that can be used in tests

  // This could use an in-memory SQLite database for testing
  // or connect to a dedicated test database instance

  // Store data in memory for the mock
  const accountRegisters: any[] = [];
  const registerEntries: any[] = [];
  const reoccurrences: any[] = [];
  const reoccurrenceSkips: any[] = [];
  const reoccurrenceSplits: any[] = [];

  const mockDb = {
    accountRegister: {
      create: vi.fn().mockImplementation(async (data: any) => {
        const d = data.data;
        const lb =
          d.latestBalance !== undefined && d.latestBalance !== null
            ? Number(d.latestBalance)
            : (d.balance !== undefined && d.balance !== null ? Number(d.balance) : 0);
        const bal =
          d.balance !== undefined && d.balance !== null
            ? Number(d.balance)
            : lb;
        const accountRegister = {
          ...d,
          id: d.id || nextSyntheticId++,
          budgetId: d.budgetId ?? 1,
          balance: bal,
          latestBalance: lb,
          depreciationRate: d.depreciationRate ?? null,
          depreciationMethod: d.depreciationMethod ?? null,
          assetOriginalValue: d.assetOriginalValue ?? null,
          assetResidualValue: d.assetResidualValue ?? null,
          assetUsefulLifeYears: d.assetUsefulLifeYears ?? null,
          assetStartAt: d.assetStartAt ?? null,
        };
        accountRegisters.push(accountRegister);
        return accountRegister;
      }),
      findMany: vi.fn().mockImplementation(async (query: any) => {
        let list = accountRegisters;
        if (query?.where?.accountId) {
          list = accountRegisters.filter(ar => ar.accountId === query.where.accountId);
        }
        // Return copies so loader always gets stable latestBalance/balance (avoids shared ref mutation).
        // Explicit numeric coercion so DataLoader and asset tests get correct values.
        return list.map((ar: any) => ({
          ...ar,
          balance: Number(ar.balance ?? ar.latestBalance ?? 0),
          latestBalance: Number(ar.latestBalance ?? ar.balance ?? 0),
          depreciationRate: ar.depreciationRate ?? null,
          depreciationMethod: ar.depreciationMethod ?? null,
          assetOriginalValue: ar.assetOriginalValue ?? null,
          assetResidualValue: ar.assetResidualValue ?? null,
          assetUsefulLifeYears: ar.assetUsefulLifeYears ?? null,
          assetStartAt: ar.assetStartAt ?? null,
        }));
      }),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    reoccurrence: {
      create: vi.fn().mockImplementation(async (data: any) => {
        const row = {
          ...data.data,
          id: data.data.id ?? reoccurrences.length + 1,
          interval: { name: data.data.intervalId === 3 ? "Month" : data.data.intervalId === 2 ? "Week" : data.data.intervalId === 1 ? "Day" : "Month" },
        };
        reoccurrences.push(row);
        return row;
      }),
      findMany: vi.fn().mockImplementation(async (query: any) => {
        if (query?.where?.accountId) {
          return reoccurrences.filter(r => r.accountId === query.where.accountId);
        }
        if (query?.where?.id?.in) {
          const ids = query.where.id.in;
          return reoccurrences.filter(r => ids.includes(r.id));
        }
        return reoccurrences;
      }),
      aggregate: vi.fn().mockResolvedValue({ _min: { lastAt: FIXED_TEST_DATE } }),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    registerEntry: {
      create: vi.fn().mockImplementation(async (data: any) => {
        const entry = {
          ...data.data,
          id: data.data.id || `entry-${nextSyntheticId++}`,
        };
        registerEntries.push(entry);
        return entry;
      }),
      createMany: vi.fn().mockImplementation(async (data: any) => {
        data.data.forEach((entry: any) => {
          registerEntries.push({
            ...entry,
            id: entry.id || `entry-${nextSyntheticId++}`,
          });
        });
        return { count: data.data.length };
      }),
      findMany: vi.fn().mockImplementation(async (query: any) => {
        if (query?.where?.register?.accountId) {
          return registerEntries.filter(re => {
            const accountRegister = accountRegisters.find(ar => ar.id === re.accountRegisterId);
            return accountRegister && accountRegister.accountId === query.where.register.accountId;
          });
        }
        if (query?.where?.accountRegisterId) {
          return registerEntries.filter(re => re.accountRegisterId === query.where.accountRegisterId);
        }
        return registerEntries;
      }),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    reoccurrenceSkip: {
      create: vi.fn(),
      findMany: vi.fn().mockImplementation(async (query: any) => {
        if (query?.where?.accountId) {
          return reoccurrenceSkips.filter(rs => rs.accountId === query.where.accountId);
        }
        return reoccurrenceSkips;
      }),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    reoccurrenceSplit: {
      create: vi.fn().mockImplementation(async (data: any) => {
        const split = {
          ...data.data,
          id: data.data.id ?? reoccurrenceSplits.length + 1,
        };
        reoccurrenceSplits.push(split);
        return split;
      }),
      findMany: vi.fn().mockImplementation(async (query: any) => {
        if (query?.where?.reoccurrence?.accountId) {
          const accountId = query.where.reoccurrence.accountId;
          const reoccurrenceIds = reoccurrences
            .filter((r) => r.accountId === accountId)
            .map((r) => r.id);
          return reoccurrenceSplits.filter((s) =>
            reoccurrenceIds.includes(s.reoccurrenceId)
          );
        }
        if (query?.where?.reoccurrenceId) {
          return reoccurrenceSplits.filter(
            (s) => s.reoccurrenceId === query.where.reoccurrenceId,
          );
        }
        return reoccurrenceSplits;
      }),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    savingsGoal: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn((callback) => callback(mockDb)),
  } as any;

  return mockDb;
}

export async function cleanupTestDatabase(db: any): Promise<void> {
  // Cleanup test data
  // In a real implementation, this would clean up the test database
  // For mocks, we just reset the mock calls
  if (db && typeof db === 'object') {
    Object.values(db).forEach((table: any) => {
      if (table && typeof table === 'object') {
        Object.values(table).forEach((method: any) => {
          if (method && typeof method.mockClear === 'function') {
            method.mockClear();
          }
        });
      }
    });
  }
}

// Test data factories
export function createMockAccountRegister(overrides = {}) {
  return {
    id: 1,
    accountId: 'test-account',
    name: 'Test Account',
    typeId: 1,
    balance: 1000,
    statementAt: FIXED_TEST_DATE,
    ...overrides,
  };
}

export function createMockReoccurrence(overrides = {}) {
  return {
    id: 1,
    accountId: 'test-account',
    accountRegisterId: 1,
    description: 'Test Reoccurrence',
    amount: 100,
    intervalId: 3, // Monthly
    intervalCount: 1,
    lastAt: FIXED_TEST_DATE,
    endAt: null,
    ...overrides,
  };
}

export function createMockRegisterEntry(overrides = {}) {
  return {
    id: 'test-entry-1',
    accountRegisterId: 1,
    description: 'Test Entry',
    amount: 100,
    balance: 1100,
    createdAt: FIXED_TEST_ISO,
    isProjected: true,
    isPending: false,
    isCleared: false,
    isBalanceEntry: false,
    isManualEntry: false,
    isReconciled: false,
    ...overrides,
  };
}
