import { PrismaClient } from '@prisma/client';
import { vi } from 'vitest';

// Mock test database setup
export async function createTestDatabase(): Promise<PrismaClient> {
  // In a real implementation, this would set up a test database
  // For now, we'll return a mock that can be used in tests

  // This could use an in-memory SQLite database for testing
  // or connect to a dedicated test database instance

  // Store data in memory for the mock
  const accountRegisters: any[] = [];
  const registerEntries: any[] = [];
  const reoccurrences: any[] = [];
  const reoccurrenceSkips: any[] = [];

  const mockDb = {
    accountRegister: {
      create: vi.fn().mockImplementation(async (data: any) => {
        const accountRegister = { ...data.data, id: data.data.id || Date.now() };
        accountRegisters.push(accountRegister);
        return accountRegister;
      }),
      findMany: vi.fn().mockImplementation(async (query: any) => {
        if (query?.where?.accountId) {
          return accountRegisters.filter(ar => ar.accountId === query.where.accountId);
        }
        return accountRegisters;
      }),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    reoccurrence: {
      create: vi.fn(),
      findMany: vi.fn().mockImplementation(async (query: any) => {
        if (query?.where?.accountId) {
          return reoccurrences.filter(r => r.accountId === query.where.accountId);
        }
        return reoccurrences;
      }),
      aggregate: vi.fn().mockResolvedValue({ _min: { lastAt: new Date() } }),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    registerEntry: {
      create: vi.fn().mockImplementation(async (data: any) => {
        const entry = { ...data.data, id: data.data.id || `entry-${Date.now()}` };
        registerEntries.push(entry);
        return entry;
      }),
      createMany: vi.fn().mockImplementation(async (data: any) => {
        data.data.forEach((entry: any) => {
          registerEntries.push({ ...entry, id: entry.id || `entry-${Date.now()}` });
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
    statementAt: new Date(),
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
    lastAt: new Date(),
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
    createdAt: new Date().toISOString(),
    isProjected: true,
    isPending: false,
    isCleared: false,
    isBalanceEntry: false,
    isManualEntry: false,
    isReconciled: false,
    ...overrides,
  };
}
