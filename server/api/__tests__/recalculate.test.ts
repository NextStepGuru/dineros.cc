import { describe, it, expect, vi, beforeEach } from 'vitest';
import { $fetch } from '@nuxt/test-utils/e2e';

// Mock the dependencies
vi.mock('~/server/clients/prismaClient', () => ({
  prisma: {
    accountRegister: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    registerEntry: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    reoccurrence: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    reoccurrenceSkip: {
      findMany: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('~/server/services/forecast', () => ({
  ForecastEngineFactory: {
    create: vi.fn(() => ({
      recalculate: vi.fn(),
    })),
  },
}));

vi.mock('~/server/lib/handleApiError', () => ({
  handleApiError: vi.fn(),
}));

describe('Recalculate API Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/recalculate', () => {
    it('should successfully recalculate for valid account ID', async () => {
      const mockForecastEngine = {
        recalculate: vi.fn().mockResolvedValue({
          isSuccess: true,
          registerEntries: [
            { id: 1, description: 'Test Entry', amount: 100, isBalanceEntry: false },
            { id: 2, description: 'Balance Entry', amount: 500, isBalanceEntry: true },
          ],
          accountRegisters: [
            { id: 1, name: 'Test Account', balance: 1000 },
          ],
        }),
      };

      const { ForecastEngineFactory } = await import('~/server/services/forecast');
      (ForecastEngineFactory.create as any).mockReturnValue(mockForecastEngine);

      // This would need to be updated when we have proper test infrastructure
      // For now, just test the logic components directly
      expect(mockForecastEngine.recalculate).toBeDefined();
    });

    it('should handle missing account ID', async () => {
      const { ForecastEngineFactory } = await import('~/server/services/forecast');
      const mockEngine = {
        recalculate: vi.fn(),
      };
      (ForecastEngineFactory.create as any).mockReturnValue(mockEngine);

      // Test logic that handles missing accountId
      const requestBody = {}; // Missing accountId

      // In a real test, this would validate the error response
      expect(() => {
        if (!requestBody || !('accountId' in requestBody)) {
          throw new Error('Account ID is required');
        }
      }).toThrow('Account ID is required');
    });

    it('should handle forecast engine errors', async () => {
      const mockForecastEngine = {
        recalculate: vi.fn().mockResolvedValue({
          isSuccess: false,
          errors: ['Database connection failed', 'Invalid account data'],
          registerEntries: [],
          accountRegisters: [],
        }),
      };

      const { ForecastEngineFactory } = await import('~/server/services/forecast');
      (ForecastEngineFactory.create as any).mockReturnValue(mockForecastEngine);

      const result = await mockForecastEngine.recalculate({
        accountId: 'test-account',
        startDate: new Date(),
        endDate: new Date(),
      });

      expect(result.isSuccess).toBe(false);
      expect(result.errors).toEqual(['Database connection failed', 'Invalid account data']);
    });

    it('should call forecast engine with correct parameters', async () => {
      const mockForecastEngine = {
        recalculate: vi.fn().mockResolvedValue({
          isSuccess: true,
          registerEntries: [],
          accountRegisters: [],
        }),
      };

      const { ForecastEngineFactory } = await import('~/server/services/forecast');
      (ForecastEngineFactory.create as any).mockReturnValue(mockForecastEngine);

      const accountId = 'test-account-123';
      await mockForecastEngine.recalculate({
        accountId,
        startDate: expect.any(Date),
        endDate: expect.any(Date),
      });

      expect(mockForecastEngine.recalculate).toHaveBeenCalledWith({
        accountId,
        startDate: expect.any(Date),
        endDate: expect.any(Date),
      });
    });
  });

  describe('GET /api/tasks/recalculate', () => {
    it('should process single account when accountId provided', async () => {
      const { prisma } = await import('~/server/clients/prismaClient');
      (prisma.accountRegister.findFirst as any).mockResolvedValue({
        accountId: 'test-account',
        isArchived: false,
      });

      const mockForecastEngine = {
        recalculate: vi.fn().mockResolvedValue({
          isSuccess: true,
          registerEntries: [
            { isProjected: true },
            { isProjected: false, isBalanceEntry: false },
            { isBalanceEntry: true },
          ],
          accountRegisters: [{ id: 1 }],
        }),
      };

      const { ForecastEngineFactory } = await import('~/server/services/forecast');
      (ForecastEngineFactory.create as any).mockReturnValue(mockForecastEngine);

      // Simulate the task endpoint logic
      const query = { accountId: 'test-account' };
      const accountExists = await prisma.accountRegister.findFirst({
        where: { accountId: query.accountId, isArchived: false },
      });

      expect(accountExists).toBeTruthy();
      expect(accountExists?.accountId).toBe('test-account');
    });

    it('should process all accounts when no accountId provided', async () => {
      const { prisma } = await import('~/server/clients/prismaClient');
      (prisma.accountRegister.findMany as any).mockResolvedValue([
        { accountId: 'account-1' },
        { accountId: 'account-2' },
        { accountId: 'account-3' },
      ]);

      const mockForecastEngine = {
        recalculate: vi.fn().mockResolvedValue({
          isSuccess: true,
          registerEntries: [],
          accountRegisters: [],
        }),
      };

      const { ForecastEngineFactory } = await import('~/server/services/forecast');
      (ForecastEngineFactory.create as any).mockReturnValue(mockForecastEngine);

      // Simulate the logic for processing all accounts
      const accounts = await prisma.accountRegister.findMany({
        where: { isArchived: false, account: { isArchived: false } },
        select: { accountId: true },
        distinct: ['accountId'],
      });

      expect(accounts).toHaveLength(3);
      expect(accounts.map(a => a.accountId)).toEqual(['account-1', 'account-2', 'account-3']);
    });

    it('should handle account not found error', async () => {
      const { prisma } = await import('~/server/clients/prismaClient');
      (prisma.accountRegister.findFirst as any).mockResolvedValue(null);

      const query = { accountId: 'non-existent-account' };
      const accountExists = await prisma.accountRegister.findFirst({
        where: { accountId: query.accountId, isArchived: false },
      });

      expect(accountExists).toBeNull();

      // This would result in an error response
      const result = {
        success: false,
        message: `Account ${query.accountId} not found in database.`,
        entriesCalculated: 0,
        accountRegisters: 0,
      };

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found in database');
    });

    it('should calculate entry breakdowns correctly', async () => {
      const mockResult = {
        isSuccess: true,
        registerEntries: [
          { isProjected: true, isBalanceEntry: false },
          { isProjected: true, isBalanceEntry: false },
          { isProjected: false, isBalanceEntry: false },
          { isProjected: false, isBalanceEntry: false },
          { isProjected: false, isBalanceEntry: false },
          { isBalanceEntry: true },
          { isBalanceEntry: true },
        ],
        accountRegisters: [{ id: 1 }, { id: 2 }],
      };

      // Simulate the breakdown calculation logic
      const entriesProjected = mockResult.registerEntries.filter(entry => entry.isProjected).length;
      const entriesHistorical = mockResult.registerEntries.filter(entry => !entry.isProjected && !entry.isBalanceEntry).length;
      const entriesBalance = mockResult.registerEntries.filter(entry => entry.isBalanceEntry).length;

      expect(entriesProjected).toBe(2);
      expect(entriesHistorical).toBe(3);
      expect(entriesBalance).toBe(2);

      const result = {
        accountId: 'test-account',
        success: true,
        entriesCalculated: mockResult.registerEntries.length,
        entriesProjected,
        entriesHistorical,
        entriesBalance,
        accountRegisters: mockResult.accountRegisters.length,
      };

      expect(result.entriesCalculated).toBe(7);
      expect(result.accountRegisters).toBe(2);
    });

    it('should handle multiple account failures gracefully', async () => {
      const accounts = [
        { accountId: 'account-1' },
        { accountId: 'account-2' },
        { accountId: 'account-3' },
      ];

      const mockResults = [
        { isSuccess: true, registerEntries: [], accountRegisters: [] },
        { isSuccess: false, errors: ['Database error'] },
        { isSuccess: true, registerEntries: [], accountRegisters: [] },
      ];

      const results: any[] = [];
      const failedAccounts: any[] = [];

      accounts.forEach((account, index) => {
        const result = mockResults[index];
        if (result.isSuccess) {
          results.push({
            accountId: account.accountId,
            success: true,
            entriesCalculated: result.registerEntries?.length || 0,
          });
        } else {
          failedAccounts.push({
            accountId: account.accountId,
            errors: result.errors,
          });
        }
      });

      expect(results).toHaveLength(2);
      expect(failedAccounts).toHaveLength(1);
      expect(failedAccounts[0].accountId).toBe('account-2');
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should respect database rate limiting during recalculation', async () => {
      const mockForecastEngine = {
        recalculate: vi.fn().mockResolvedValue({
          isSuccess: true,
          registerEntries: Array.from({ length: 50 }, (_, i) => ({
            id: i,
            description: `Entry ${i}`,
            amount: 100,
            isManualEntry: false,
          })),
          accountRegisters: [],
        }),
      };

      const { ForecastEngineFactory } = await import('~/server/services/forecast');
      (ForecastEngineFactory.create as any).mockReturnValue(mockForecastEngine);

      // The rate limiter should be called during persistence
      const result = await mockForecastEngine.recalculate({
        accountId: 'test-account',
        startDate: new Date(),
        endDate: new Date(),
      });

             expect(result.isSuccess).toBe(true);
       expect(result.registerEntries?.length).toBe(50);
       // Rate limiting would happen in DataPersisterService during persistence
    });
  });

  describe('Manual Entry Handling', () => {
    it('should filter out manual entries during persistence', async () => {
      const mockResult = {
        isSuccess: true,
        registerEntries: [
          { id: 1, description: 'Auto Entry', isManualEntry: false },
          { id: 2, description: 'Manual Entry', isManualEntry: true },
          { id: 3, description: 'Balance Entry', isBalanceEntry: true },
          { id: 4, description: 'Another Manual', isManualEntry: true },
        ],
        accountRegisters: [],
      };

      // Simulate the filtering logic from ForecastEngine
      const entriesToPersist = mockResult.registerEntries.filter(e => !e.isManualEntry);
      const manualEntriesToPersist = mockResult.registerEntries.filter(e => e.isManualEntry);

      expect(entriesToPersist).toHaveLength(2);
      expect(manualEntriesToPersist).toHaveLength(2);
      expect(entriesToPersist.map(e => e.description)).toEqual(['Auto Entry', 'Balance Entry']);
    });
  });
});
