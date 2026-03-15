import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  // Make defineEventHandler available globally before any imports
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
});

// Mock H3/Nuxt utilities before any imports
vi.mock('h3', () => ({
  defineEventHandler: vi.fn((handler) => handler),
  createError: vi.fn((error) => {
    const statusCode = error.statusCode || 500;
    const message = error.statusMessage || error.message || 'Unknown error';
    const fullMessage = `HTTP ${statusCode}: ${message}`;
    const err = new Error(fullMessage) as any;
    err.statusCode = statusCode;
    err.statusMessage = message;
    throw err;
  }),
  getQuery: vi.fn(),
  readBody: vi.fn(),
  setHeader: vi.fn(),
  appendHeader: vi.fn(),
  getHeader: vi.fn(),
  getHeaders: vi.fn(),
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  getRouterParam: vi.fn(),
  getRouterParams: vi.fn(),
  isMethod: vi.fn(),
  assertMethod: vi.fn(),
  getMethod: vi.fn(),
  getRequestURL: vi.fn(),
  getRequestIP: vi.fn()
}));

// Mock server dependencies
vi.mock('~/server/logger', () => ({
  log: vi.fn(),
}));

// Mock the dependencies
vi.mock('~/server/clients/prismaClient', () => ({
  prisma: {
    user: {
      findUniqueOrThrow: vi.fn(),
    },
    reoccurrence: {
      findMany: vi.fn(),
    },
    budget: {
      findMany: vi.fn(),
    },
    interval: {
      findMany: vi.fn(),
    },
    accountType: {
      findMany: vi.fn(),
    },
    accountRegister: {
      findMany: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('~/server/lib/getUser', () => ({
  getUser: vi.fn(),
}));

vi.mock('~/server/lib/handleApiError', () => ({
  handleApiError: vi.fn(),
}));

vi.mock('~/schema/zod', () => {
  const parse = vi.fn();
  return {
    publicProfileSchema: {
      parse,
      extend: vi.fn(() => ({ parse })),
    },
  };
});

describe('Core API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/user', () => {
    let userGetHandler: any;

    beforeEach(async () => {
      // Import the handler after mocking dependencies
      const module = await import('../user.get');
      userGetHandler = module.default;
    });

    it('should return user profile for authenticated user', async () => {
      const mockEvent = { context: { user: { userId: 123 } } };
      const mockUser = {
        id: 123,
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date('2023-01-01'),
      };
      const mockParsedProfile = {
        id: 123,
        email: 'test@example.com',
        name: 'Test User',
      };

      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { publicProfileSchema } = await import('~/schema/zod');

      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
      (publicProfileSchema.parse as any).mockReturnValue(mockParsedProfile);

      const result = await userGetHandler(mockEvent);

      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 123 },
      });
      expect(publicProfileSchema.parse).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(mockParsedProfile);
    });

    it('should handle user not found error', async () => {
      const mockEvent = { context: { user: { userId: 999 } } };

      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { handleApiError } = await import('~/server/lib/handleApiError');

      (getUser as any).mockReturnValue({ userId: 999 });
      const notFoundError = new Error('User not found');
      (prisma.user.findUniqueOrThrow as any).mockRejectedValue(notFoundError);

      await expect(userGetHandler(mockEvent)).rejects.toThrow('User not found');

      expect(handleApiError).toHaveBeenCalledWith(notFoundError);
    });

    it('should handle authentication errors', async () => {
      const mockEvent = { context: {} };

      const { getUser } = await import('~/server/lib/getUser');
      const { handleApiError } = await import('~/server/lib/handleApiError');

      const authError = new Error('User not found in context');
      (getUser as any).mockImplementation(() => {
        throw authError;
      });

      await expect(userGetHandler(mockEvent)).rejects.toThrow('User not found in context');

      expect(handleApiError).toHaveBeenCalledWith(authError);
    });

    it('should handle schema validation errors', async () => {
      const mockEvent = { context: { user: { userId: 123 } } };
      const mockUser = {
        id: 123,
        email: 'invalid-email',
        name: null, // Invalid data
      };

      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { publicProfileSchema } = await import('~/schema/zod');
      const { handleApiError } = await import('~/server/lib/handleApiError');

      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);

      const validationError = new Error('Schema validation failed');
      (publicProfileSchema.parse as any).mockImplementation(() => {
        throw validationError;
      });

      await expect(userGetHandler(mockEvent)).rejects.toThrow('Schema validation failed');

      expect(handleApiError).toHaveBeenCalledWith(validationError);
    });
  });

  describe('GET /api/lists', () => {
    let listsHandler: any;

    beforeEach(async () => {
      const module = await import('../lists');
      listsHandler = module.default;
    });

    it('should return all lists data for authenticated user', async () => {
      const mockEvent = { context: { user: { userId: 123 } } };

      const mockReoccurrences = [
        {
          id: 1,
          description: 'Monthly Salary',
          amount: 5000,
          lastAt: new Date('2023-01-01'),
        },
      ];

      const mockBudgets = [
        {
          id: 1,
          name: 'Personal Budget',
          userId: 123,
          isArchived: false,
        },
      ];

      const mockIntervals = [
        { id: 1, name: 'Monthly', days: 30 },
        { id: 2, name: 'Weekly', days: 7 },
      ];

      const mockAccountTypes = [
        { id: 1, name: 'Checking', creditType: false },
        { id: 2, name: 'Credit Card', creditType: true },
      ];

      const mockAccountRegisters = [
        {
          id: 1,
          name: 'Main Checking',
          balance: 1000,
          sortOrder: 1,
          isArchived: false,
        },
      ];

      const mockAccounts = [
        {
          id: 1,
          name: 'Primary Account',
          userId: 123,
        },
      ];

      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');

      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.reoccurrence.findMany as any).mockResolvedValue(mockReoccurrences);
      (prisma.budget.findMany as any).mockResolvedValue(mockBudgets);
      (prisma.interval.findMany as any).mockResolvedValue(mockIntervals);
      (prisma.accountType.findMany as any).mockResolvedValue(mockAccountTypes);
      (prisma.accountRegister.findMany as any).mockResolvedValue(mockAccountRegisters);
      (prisma.account.findMany as any).mockResolvedValue(mockAccounts);

      const result = await listsHandler(mockEvent);

      expect(result).toEqual({
        reoccurrences: mockReoccurrences,
        intervals: mockIntervals,
        accountTypes: mockAccountTypes,
        accountRegisters: mockAccountRegisters,
        budgets: mockBudgets,
        accounts: mockAccounts,
      });

      expect(prisma.reoccurrence.findMany).toHaveBeenCalledWith({
        where: {
          account: {
            is: {
              userAccounts: {
                some: { userId: 123 },
              },
            },
          },
        },
        orderBy: [
          { lastAt: "asc" },
          { id: "asc" },
        ],
      });

      expect(prisma.budget.findMany).toHaveBeenCalledWith({
        where: {
          isArchived: false,
          userId: 123,
        },
      });
    });

    it('should filter results by user access permissions', async () => {
      const mockEvent = { context: { user: { userId: 456 } } };

      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');

      (getUser as any).mockReturnValue({ userId: 456 });
      (prisma.reoccurrence.findMany as any).mockResolvedValue([]);
      (prisma.budget.findMany as any).mockResolvedValue([]);
      (prisma.interval.findMany as any).mockResolvedValue([]);
      (prisma.accountType.findMany as any).mockResolvedValue([]);
      (prisma.accountRegister.findMany as any).mockResolvedValue([]);
      (prisma.account.findMany as any).mockResolvedValue([]);

      await listsHandler(mockEvent);

      // Should filter by correct user ID
      expect(prisma.budget.findMany).toHaveBeenCalledWith({
        where: {
          isArchived: false,
          userId: 456,
        },
      });

      expect(prisma.account.findMany).toHaveBeenCalledWith({
        where: {
          userAccounts: {
            some: { userId: 456 },
          },
        },
      });
    });

    it('should handle empty results gracefully', async () => {
      const mockEvent = { context: { user: { userId: 123 } } };

      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');

      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.reoccurrence.findMany as any).mockResolvedValue([]);
      (prisma.budget.findMany as any).mockResolvedValue([]);
      (prisma.interval.findMany as any).mockResolvedValue([]);
      (prisma.accountType.findMany as any).mockResolvedValue([]);
      (prisma.accountRegister.findMany as any).mockResolvedValue([]);
      (prisma.account.findMany as any).mockResolvedValue([]);

      const result = await listsHandler(mockEvent);

      expect(result).toEqual({
        reoccurrences: [],
        intervals: [],
        accountTypes: [],
        accountRegisters: [],
        budgets: [],
        accounts: [],
      });
    });

    it('should handle database errors gracefully', async () => {
      const mockEvent = { context: { user: { userId: 123 } } };

      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { handleApiError } = await import('~/server/lib/handleApiError');

      (getUser as any).mockReturnValue({ userId: 123 });

      const dbError = new Error('Database connection failed');
      (prisma.reoccurrence.findMany as any).mockRejectedValue(dbError);

      await expect(listsHandler(mockEvent)).rejects.toThrow('An error occurred while fetching lists.');

      expect(handleApiError).toHaveBeenCalledWith(dbError);
    });

    it('should filter out archived budgets and account registers', async () => {
      const mockEvent = { context: { user: { userId: 123 } } };

      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');

      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.reoccurrence.findMany as any).mockResolvedValue([]);
      (prisma.budget.findMany as any).mockResolvedValue([]);
      (prisma.interval.findMany as any).mockResolvedValue([]);
      (prisma.accountType.findMany as any).mockResolvedValue([]);
      (prisma.accountRegister.findMany as any).mockResolvedValue([]);
      (prisma.account.findMany as any).mockResolvedValue([]);

      await listsHandler(mockEvent);

      // Should filter out archived items
      expect(prisma.budget.findMany).toHaveBeenCalledWith({
        where: {
          isArchived: false,
          userId: 123,
        },
      });

      expect(prisma.accountRegister.findMany).toHaveBeenCalledWith({
        where: {
          isArchived: false,
          account: {
            is: {
              userAccounts: {
                some: { userId: 123 },
              },
            },
          },
        },
        orderBy: {
          sortOrder: "asc",
        },
      });
    });

    it('should sort results correctly', async () => {
      const mockEvent = { context: { user: { userId: 123 } } };

      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');

      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.reoccurrence.findMany as any).mockResolvedValue([]);
      (prisma.budget.findMany as any).mockResolvedValue([]);
      (prisma.interval.findMany as any).mockResolvedValue([]);
      (prisma.accountType.findMany as any).mockResolvedValue([]);
      (prisma.accountRegister.findMany as any).mockResolvedValue([]);
      (prisma.account.findMany as any).mockResolvedValue([]);

      await listsHandler(mockEvent);

      // Should apply correct sorting
      expect(prisma.reoccurrence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { lastAt: "asc" },
            { id: "asc" },
          ],
        })
      );

      expect(prisma.accountRegister.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            sortOrder: "asc",
          },
        })
      );
    });
  });

  describe('GET /api/countries', () => {
    let countriesHandler: any;

    beforeEach(async () => {
      const module = await import('../countries.get');
      countriesHandler = module.default;
    });

    it('should return active countries with id, name, code, code3', async () => {
      const mockCountries = [
        { id: 1, name: 'United States', code: 'US', code3: 'USA' },
        { id: 2, name: 'Canada', code: 'CA', code3: 'CAN' },
      ];

      const { prisma } = await import('~/server/clients/prismaClient');
      (prisma.$queryRaw as any).mockResolvedValue(mockCountries);

      const result = await countriesHandler({});

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(result).toEqual(mockCountries);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('code');
      expect(result[0]).toHaveProperty('code3');
    });

    it('should return empty array when no active countries', async () => {
      const { prisma } = await import('~/server/clients/prismaClient');
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const result = await countriesHandler({});

      expect(result).toEqual([]);
    });

    it('should throw 500 when database fails', async () => {
      const { prisma } = await import('~/server/clients/prismaClient');
      (prisma.$queryRaw as any).mockRejectedValue(new Error('Connection refused'));

      await expect(countriesHandler({})).rejects.toThrow(/Failed to fetch countries|500/);
    });
  });

  describe('Authentication Integration', () => {
    it('should handle authentication consistently across endpoints', async () => {
      const userGetModule = await import('../user.get');
      const listsModule = await import('../lists');
      const { getUser } = await import('~/server/lib/getUser');
      const { handleApiError } = await import('~/server/lib/handleApiError');

      const mockEvent = { context: {} };
      const authError = new Error('Unauthorized');

      (getUser as any).mockImplementation(() => {
        throw authError;
      });

      // Make handleApiError throw the original error
      (handleApiError as any).mockImplementation((error: any) => {
        throw error;
      });

      // Both endpoints should handle auth errors consistently
      await expect(userGetModule.default(mockEvent as any)).rejects.toThrow('Unauthorized');
      await expect(listsModule.default(mockEvent as any)).rejects.toThrow('Unauthorized');
    });
  });

  describe('Error Handling Integration', () => {
    it('should use handleApiError consistently', async () => {
      const { handleApiError } = await import('~/server/lib/handleApiError');

      // handleApiError should be called whenever an error occurs
      expect(handleApiError).toBeDefined();
      expect(typeof handleApiError).toBe('function');
    });
  });
});
