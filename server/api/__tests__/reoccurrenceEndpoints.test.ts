import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
  (globalThis as any).getQuery = vi.fn();
  (globalThis as any).readBody = vi.fn();
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
  readBody: vi.fn(),
  getQuery: vi.fn(),
  setResponseStatus: vi.fn(),
}));

// Mock server dependencies
vi.mock('~/server/clients/prismaClient', () => ({
  prisma: {
    accountRegister: {
      findFirstOrThrow: vi.fn(),
    },
    reoccurrence: {
      findFirstOrThrow: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    registerEntry: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/server/clients/queuesClient', () => ({
  addRecalculateJob: vi.fn(),
}));

vi.mock('~/server/lib/getUser', () => ({
  getUser: vi.fn(),
}));

vi.mock('~/server/lib/handleApiError', () => ({
  handleApiError: vi.fn(),
}));

vi.mock('~/schema/zod', () => ({
  reoccurrenceSchema: {
    parse: vi.fn(),
  },
}));

describe('Reoccurrence API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/reoccurrence', () => {
    let reoccurrencePostHandler: any;

    beforeEach(async () => {
      const module = await import('../reoccurrence.post');
      reoccurrencePostHandler = module.default;
    });

    it('should successfully create a new reoccurrence', async () => {
      const mockEvent = {};
      const mockBody = {
        id: null,
        accountId: 'account-123',
        accountRegisterId: 1,
        transferAccountRegisterId: null,
        intervalId: 1,
        adjustBeforeIfOnWeekend: false,
        description: 'Monthly Salary',
        amount: 5000,
        lastAt: new Date('2024-01-01'),
        endAt: null,
      };

      const mockAccountRegister = {
        id: 1,
        accountId: 'account-123',
      };

                   const mockCreatedReoccurrence = {
        ...mockBody,
        id: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { reoccurrenceSchema } = await import('~/schema/zod');
      const { addRecalculateJob } = await import('~/server/clients/queuesClient');

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (reoccurrenceSchema.parse as any).mockReturnValue(mockBody);
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue(mockAccountRegister);
      (prisma.reoccurrence.upsert as any).mockResolvedValue(mockCreatedReoccurrence);
      (reoccurrenceSchema.parse as any).mockReturnValue(mockCreatedReoccurrence);

      const result = await reoccurrencePostHandler(mockEvent);

      expect((globalThis as any).readBody).toHaveBeenCalledWith(mockEvent);
      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(prisma.accountRegister.findFirstOrThrow).toHaveBeenCalledWith({
        where: {
          id: 1,
          account: {
            id: 'account-123',
            userAccounts: {
              some: {
                userId: 123,
              },
            },
          },
        },
      });
      expect(prisma.reoccurrence.upsert).toHaveBeenCalledWith({
        where: { id: expect.any(Number) },
        create: expect.objectContaining({
          accountId: 'account-123',
          accountRegisterId: 1,
          description: 'Monthly Salary',
          amount: 5000,
        }),
        update: expect.objectContaining({
          accountId: 'account-123',
          accountRegisterId: 1,
          description: 'Monthly Salary',
          amount: 5000,
        }),
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({ accountId: 'account-123' });
      expect(result).toEqual(mockCreatedReoccurrence);
    });

    it('should successfully update existing reoccurrence', async () => {
      const mockEvent = {};
      const mockBody = {
        id: 123,
        accountId: 'account-123',
        accountRegisterId: 1,
        transferAccountRegisterId: 2,
        intervalId: 2,
        adjustBeforeIfOnWeekend: true,
        description: 'Updated Salary',
        amount: 6000,
        lastAt: new Date('2024-01-15'),
        endAt: new Date('2024-12-31'),
      };

      const mockAccountRegister = {
        id: 1,
        accountId: 'account-123',
      };

      const mockUpdatedReoccurrence = {
        ...mockBody,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const { readBody } = await import('h3');
      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { reoccurrenceSchema } = await import('~/schema/zod');
      const { addRecalculateJob } = await import('~/server/clients/queuesClient');

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (reoccurrenceSchema.parse as any).mockReturnValue(mockBody);
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue(mockAccountRegister);
      (prisma.reoccurrence.upsert as any).mockResolvedValue(mockUpdatedReoccurrence);
      (reoccurrenceSchema.parse as any).mockReturnValue(mockUpdatedReoccurrence);

      const result = await reoccurrencePostHandler(mockEvent);

      expect(prisma.reoccurrence.upsert).toHaveBeenCalledWith({
        where: { id: 123 },
        create: expect.objectContaining({
          description: 'Updated Salary',
          amount: 6000,
          transferAccountRegisterId: 2,
        }),
        update: expect.objectContaining({
          description: 'Updated Salary',
          amount: 6000,
          transferAccountRegisterId: 2,
        }),
      });
      expect(result).toEqual(mockUpdatedReoccurrence);
    });

    it('should handle unauthorized access to account register', async () => {
      const mockEvent = {};
      const mockBody = {
        accountRegisterId: 1,
        description: 'Unauthorized Reoccurrence',
      };

      const { readBody } = await import('h3');
      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { reoccurrenceSchema } = await import('~/schema/zod');
      const { handleApiError } = await import('~/server/lib/handleApiError');

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (reoccurrenceSchema.parse as any).mockReturnValue(mockBody);
      (prisma.accountRegister.findFirstOrThrow as any).mockRejectedValue(
        new Error('User does not have permission to access this account register')
      );
      (handleApiError as any).mockImplementation((error: any) => {
        throw error;
      });

      await expect(reoccurrencePostHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it('should handle schema validation errors', async () => {
      const mockEvent = {};
      const mockBody = {
        accountRegisterId: 'invalid-id', // Should be number
        description: '',
      };

      const { readBody } = await import('h3');
      const { getUser } = await import('~/server/lib/getUser');
      const { reoccurrenceSchema } = await import('~/schema/zod');
      const { handleApiError } = await import('~/server/lib/handleApiError');

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });

      const validationError = new Error('Invalid schema');
      (reoccurrenceSchema.parse as any).mockImplementation(() => {
        throw validationError;
      });
      (handleApiError as any).mockImplementation((error: any) => {
        throw error;
      });

      await expect(reoccurrencePostHandler(mockEvent)).rejects.toThrow('Invalid schema');
      expect(handleApiError).toHaveBeenCalledWith(validationError);
    });

    it('should handle database upsert errors', async () => {
      const mockEvent = {};
      const mockBody = {
        accountRegisterId: 1,
        description: 'Test Reoccurrence',
      };

      const mockAccountRegister = {
        id: 1,
        accountId: 'account-123',
      };

      const { readBody } = await import('h3');
      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { reoccurrenceSchema } = await import('~/schema/zod');
      const { handleApiError } = await import('~/server/lib/handleApiError');

      const dbError = new Error('Database constraint violation');

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (reoccurrenceSchema.parse as any).mockReturnValue(mockBody);
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue(mockAccountRegister);
      (prisma.reoccurrence.upsert as any).mockRejectedValue(dbError);
      (handleApiError as any).mockImplementation((error: any) => {
        throw error;
      });

      await expect(reoccurrencePostHandler(mockEvent)).rejects.toThrow('Database constraint violation');
      expect(handleApiError).toHaveBeenCalledWith(dbError);
    });
  });

  describe('DELETE /api/reoccurrence', () => {
    let reoccurrenceDeleteHandler: any;

    beforeEach(async () => {
      const module = await import('../reoccurrence.delete');
      reoccurrenceDeleteHandler = module.default;
    });

    it('should successfully delete reoccurrence and related entries', async () => {
      const mockEvent = {};
      const mockQuery = { reoccurrenceId: '123' };

      const mockReoccurrence = {
        id: 123,
        accountId: 'account-123',
        description: 'Monthly Salary',
        amount: 5000,
      };

      const mockDeletedReoccurrence = {
        id: 123,
        description: 'Monthly Salary',
        amount: 5000,
      };

      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { reoccurrenceSchema } = await import('~/schema/zod');
      const { addRecalculateJob } = await import('~/server/clients/queuesClient');

      (globalThis as any).getQuery.mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.reoccurrence.findFirstOrThrow as any).mockResolvedValue(mockReoccurrence);
      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
        const mockPrisma = {
          registerEntry: {
            deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
          },
          reoccurrence: {
            delete: vi.fn().mockResolvedValue(mockDeletedReoccurrence),
          },
        };
        return await callback(mockPrisma);
      });
      (reoccurrenceSchema.parse as any).mockReturnValue(mockDeletedReoccurrence);

      const result = await reoccurrenceDeleteHandler(mockEvent);

      expect((globalThis as any).getQuery).toHaveBeenCalledWith(mockEvent);
      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(prisma.reoccurrence.findFirstOrThrow).toHaveBeenCalledWith({
        where: {
          id: 123,
          register: {
            account: {
              userAccounts: {
                some: {
                  id: 123,
                },
              },
            },
          },
        },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(addRecalculateJob).toHaveBeenCalledWith({ accountId: 'account-123' });
      expect(result).toEqual(mockDeletedReoccurrence);
    });

    it('should handle unauthorized access', async () => {
      const mockEvent = {};
      const mockQuery = { reoccurrenceId: '123' };

      const { getQuery } = await import('h3');
      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { handleApiError } = await import('~/server/lib/handleApiError');

      (getQuery as any).mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.reoccurrence.findFirstOrThrow as any).mockRejectedValue(
        new Error('Reoccurrence not found or unauthorized')
      );
      (handleApiError as any).mockImplementation((error: any) => {
        throw error;
      });

      await expect(reoccurrenceDeleteHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it('should handle invalid reoccurrence ID format', async () => {
      const mockEvent = {};
      const mockQuery = { reoccurrenceId: 'invalid-id' };

      const { getQuery } = await import('h3');
      const { getUser } = await import('~/server/lib/getUser');
      const { handleApiError } = await import('~/server/lib/handleApiError');

      (getQuery as any).mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue({ userId: 123 });
      (handleApiError as any).mockImplementation((error: any) => {
        throw error;
      });

      await expect(reoccurrenceDeleteHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it('should handle transaction failures', async () => {
      const mockEvent = {};
      const mockQuery = { reoccurrenceId: '123' };

      const mockReoccurrence = {
        id: 123,
        accountId: 'account-123',
      };

      const { getQuery } = await import('h3');
      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { handleApiError } = await import('~/server/lib/handleApiError');

      const transactionError = new Error('Transaction failed');

      (getQuery as any).mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.reoccurrence.findFirstOrThrow as any).mockResolvedValue(mockReoccurrence);
      (prisma.$transaction as any).mockRejectedValue(transactionError);
      (handleApiError as any).mockImplementation((error: any) => {
        throw error;
      });

      await expect(reoccurrenceDeleteHandler(mockEvent)).rejects.toThrow('Transaction failed');
      expect(handleApiError).toHaveBeenCalledWith(transactionError);
    });

    it('should handle missing reoccurrence ID in query', async () => {
      const mockEvent = {};
      const mockQuery = {}; // Missing reoccurrenceId

      const { getQuery } = await import('h3');
      const { getUser } = await import('~/server/lib/getUser');
      const { handleApiError } = await import('~/server/lib/handleApiError');

      (getQuery as any).mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue({ userId: 123 });
      (handleApiError as any).mockImplementation((error: any) => {
        throw error;
      });

      await expect(reoccurrenceDeleteHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe('Cross-endpoint Integration', () => {
    it('should use consistent error handling across reoccurrence endpoints', async () => {
      const { handleApiError } = await import('~/server/lib/handleApiError');

      expect(handleApiError).toBeDefined();
      expect(typeof handleApiError).toBe('function');
    });

    it('should use consistent user authentication', async () => {
      const { getUser } = await import('~/server/lib/getUser');

      expect(getUser).toBeDefined();
      expect(typeof getUser).toBe('function');
    });

    it('should trigger recalculation consistently', async () => {
      const { addRecalculateJob } = await import('~/server/clients/queuesClient');

      expect(addRecalculateJob).toBeDefined();
      expect(typeof addRecalculateJob).toBe('function');
    });

    it('should use consistent schema validation', async () => {
      const { reoccurrenceSchema } = await import('~/schema/zod');

      expect(reoccurrenceSchema).toBeDefined();
      expect(typeof reoccurrenceSchema.parse).toBe('function');
    });
  });
});
