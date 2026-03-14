import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock the dependencies
vi.mock('~/server/logger', () => ({
  log: vi.fn(),
}));

// Mock h3 utilities
const mockCreateError = vi.fn();
vi.mock('h3', () => ({
  createError: mockCreateError,
  defineEventHandler: vi.fn((handler) => handler),
}));

describe('Server Library Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset createError mock to throw errors properly for tests
    mockCreateError.mockImplementation((error) => {
      const statusCode = error.statusCode || 500;
      const message = error.statusMessage || error.message || 'Unknown error';
      const fullMessage = `HTTP ${statusCode}: ${message}`;
      const err = new Error(fullMessage) as any;
      err.statusCode = statusCode;
      err.statusMessage = message;
      throw err;
    });
  });

  describe('handleApiError', () => {
    // Import the function after mocking dependencies
    let handleApiError: any;

    beforeEach(async () => {
      const module = await import('../handleApiError');
      handleApiError = module.handleApiError;
    });

    it('should handle Zod validation errors', () => {
      const zodSchema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const zodError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['name'],
          message: 'Expected string, received number',
        },
        {
          code: 'invalid_type',
          expected: 'number',
          received: 'string',
          path: ['age'],
          message: 'Expected number, received string',
        },
      ]);

      expect(() => handleApiError(zodError)).toThrow('HTTP 400: name: Expected string, received number, age: Expected number, received string');

      expect(mockCreateError).toHaveBeenCalledWith({
        statusCode: 400,
        statusMessage: 'name: Expected string, received number, age: Expected number, received string',
      });
    });

    it('should handle Prisma database errors', () => {
      const prismaError = {
        code: 'P2002',
        meta: { target: ['email'] },
        message: 'Unique constraint failed',
      };

      expect(() => handleApiError(prismaError)).toThrow('HTTP 500: Database operation failed');

      expect(mockCreateError).toHaveBeenCalledWith({
        statusCode: 500,
        statusMessage: 'Database operation failed',
      });
    });

    it('should handle PrismaClientInitializationError with 503', () => {
      const initError = Object.assign(new Error('Connection refused'), {
        name: 'PrismaClientInitializationError',
      });

      expect(() => handleApiError(initError)).toThrow(/503|Service temporarily unavailable/);

      expect(mockCreateError).toHaveBeenCalledWith({
        statusCode: 503,
        statusMessage: 'Service temporarily unavailable. Please try again later.',
      });
    });

    it('should handle Prisma errors by name (PrismaClientKnownRequestError)', () => {
      const prismaError = Object.assign(new Error('Record not found'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2025',
      });

      expect(() => handleApiError(prismaError)).toThrow('HTTP 500: Database operation failed');

      expect(mockCreateError).toHaveBeenCalledWith({
        statusCode: 500,
        statusMessage: 'Database operation failed',
      });
    });

    it('should handle generic Error instances', () => {
      const genericError = new Error('Something went wrong');

      expect(() => handleApiError(genericError)).toThrow('HTTP 500: Something went wrong');

      expect(mockCreateError).toHaveBeenCalledWith({
        statusCode: 500,
        statusMessage: 'Something went wrong',
      });
    });

    it('should handle unknown error types', () => {
      const unknownError = 'string error';

      // For non-Error objects, the function might not handle them (depending on implementation)
      // This tests the behavior when an unexpected error type is passed
      expect(() => handleApiError(unknownError)).not.toThrow();
    });

    it('should handle null and undefined errors', () => {
      expect(() => handleApiError(null)).not.toThrow();
      expect(() => handleApiError(undefined)).not.toThrow();
    });
  });

  describe('getUser', () => {
    let getUser: any;

    beforeEach(async () => {
      const module = await import('../getUser');
      getUser = module.getUser;
    });

    it('should return user when user exists in context', () => {
      const mockEvent = {
        context: {
          user: {
            userId: 123,
            jwtKey: 'test-jwt-key',
            iat: 1234567890,
            exp: 1234567890 + 3600,
          },
        },
      };

      const result = getUser(mockEvent as any);

      expect(result).toEqual({
        userId: 123,
        jwtKey: 'test-jwt-key',
        iat: 1234567890,
        exp: 1234567890 + 3600,
      });
    });

    it('should throw error when user is not in context', () => {
      const mockEvent = {
        context: {},
      };

      expect(() => getUser(mockEvent as any)).toThrow('HTTP 401: User not found in context');

      expect(mockCreateError).toHaveBeenCalledWith({
        statusMessage: 'User not found in context',
        statusCode: 401,
      });
    });

    it('should throw error when context is missing entirely', () => {
      const mockEvent = {};

      expect(() => getUser(mockEvent as any)).toThrow('HTTP 401: User not found in context');
    });

    it('should handle user context with additional properties', () => {
      const mockEvent = {
        context: {
          user: {
            userId: 456,
            jwtKey: 'another-jwt-key',
            iat: 1234567890,
            exp: 1234567890 + 7200,
            extra: 'property', // Additional property should not interfere
          },
        },
      };

      const result = getUser(mockEvent as any);

      expect(result.userId).toBe(456);
      expect(result.jwtKey).toBe('another-jwt-key');
      expect(result).toHaveProperty('extra'); // Should preserve additional properties
    });
  });

  describe('updateMulti', () => {
    let updateMulti: any;
    let mockPrisma: any;

    beforeEach(async () => {
      const module = await import('../updateMulti');
      updateMulti = module.default;

      mockPrisma = {
        $executeRawUnsafe: vi.fn(),
      };
    });

    it('should generate correct SQL for single field update', async () => {
      const tableName = 'users';
      const fields = ['name'];
      const values = [
        [1, 'John'],
        [2, 'Jane'],
      ];

      mockPrisma.$executeRawUnsafe.mockResolvedValue({ count: 2 });

      await updateMulti(mockPrisma, tableName, fields, values);

      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        'UPDATE "users" SET "name" = "t"."name" FROM (VALUES (\'$1\',\'$2\'),(\'$3\',\'$4\')) AS t("id", "name") WHERE "users"."id" = "t"."id"',
        1, 'John', 2, 'Jane'
      );
    });

    it('should generate correct SQL for multiple field updates', async () => {
      const tableName = 'accounts';
      const fields = ['name', 'balance'];
      const values = [
        [1, 'Checking', 1000],
        [2, 'Savings', 5000],
      ];

      mockPrisma.$executeRawUnsafe.mockResolvedValue({ count: 2 });

      await updateMulti(mockPrisma, tableName, fields, values);

      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        'UPDATE "accounts" SET "name" = "t"."name", "balance" = "t"."balance" FROM (VALUES (\'$1\',\'$2\',\'$3\'),(\'$4\',\'$5\',\'$6\')) AS t("id", "name", "balance") WHERE "accounts"."id" = "t"."id"',
        1, 'Checking', 1000, 2, 'Savings', 5000
      );
    });

    it('should handle empty values array', async () => {
      const tableName = 'users';
      const fields = ['name'];
      const values: any[] = [];

      mockPrisma.$executeRawUnsafe.mockResolvedValue({ count: 0 });

      await updateMulti(mockPrisma, tableName, fields, values);

      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        'UPDATE "users" SET "name" = "t"."name" FROM (VALUES ) AS t("id", "name") WHERE "users"."id" = "t"."id"'
      );
    });

    it('should handle single row update', async () => {
      const tableName = 'settings';
      const fields = ['value'];
      const values = [[1, 'enabled']];

      mockPrisma.$executeRawUnsafe.mockResolvedValue({ count: 1 });

      await updateMulti(mockPrisma, tableName, fields, values);

      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        'UPDATE "settings" SET "value" = "t"."value" FROM (VALUES (\'$1\',\'$2\')) AS t("id", "value") WHERE "settings"."id" = "t"."id"',
        1, 'enabled'
      );
    });

    it('should properly escape field names in SQL', async () => {
      const tableName = 'weird_table';
      const fields = ['field-with-dashes', 'field.with.dots'];
      const values = [[1, 'value1', 'value2']];

      mockPrisma.$executeRawUnsafe.mockResolvedValue({ count: 1 });

      await updateMulti(mockPrisma, tableName, fields, values);

      const expectedSQL = 'UPDATE "weird_table" SET "field-with-dashes" = "t"."field-with-dashes", "field.with.dots" = "t"."field.with.dots" FROM (VALUES (\'$1\',\'$2\',\'$3\')) AS t("id", "field-with-dashes", "field.with.dots") WHERE "weird_table"."id" = "t"."id"';

      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expectedSQL,
        1, 'value1', 'value2'
      );
    });

    it('should handle database errors gracefully', async () => {
      const tableName = 'users';
      const fields = ['name'];
      const values = [[1, 'John']];

      const dbError = new Error('Database connection failed');
      mockPrisma.$executeRawUnsafe.mockRejectedValue(dbError);

      await expect(updateMulti(mockPrisma, tableName, fields, values)).rejects.toThrow('Database connection failed');
    });

    it('should handle various data types in values', async () => {
      const tableName = 'mixed_data';
      const fields = ['name', 'count', 'active', 'created_at'];
      const values = [
        [1, 'Test', 42, true, new Date('2023-01-01')],
        [2, 'Another', 0, false, null],
      ];

      mockPrisma.$executeRawUnsafe.mockResolvedValue({ count: 2 });

      await updateMulti(mockPrisma, tableName, fields, values);

      // Should handle mixed data types properly
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "mixed_data"'),
        ...values.flat()
      );
    });
  });

  describe('withErrorHandler', () => {
    it('should return handler result when handler succeeds', async () => {
      const { withErrorHandler } = await import('../withErrorHandler');
      const handler = vi.fn().mockResolvedValue({ ok: true });
      const wrapped = withErrorHandler(handler);
      const mockEvent = {
        node: { req: { url: '/api/test', method: 'GET' } },
      };
      const result = await wrapped(mockEvent as any);
      expect(handler).toHaveBeenCalledWith(mockEvent);
      expect(result).toEqual({ ok: true });
    });

    it('should log and call handleApiError when handler throws', async () => {
      const { log } = await import('~/server/logger');
      const { withErrorHandler } = await import('../withErrorHandler');
      const err = new Error('Handler failed');
      const handler = vi.fn().mockRejectedValue(err);
      const wrapped = withErrorHandler(handler);
      const mockEvent = {
        node: { req: { url: '/api/login', method: 'POST' } },
      };
      await expect(wrapped(mockEvent as any)).rejects.toThrow();
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'API error caught by global handler',
          level: 'error',
          data: expect.objectContaining({
            error: 'Handler failed',
            url: '/api/login',
            method: 'POST',
          }),
        })
      );
    });
  });

  describe('Integration Tests', () => {
    it('should work together in typical API flow', async () => {
      // Test how these functions work together in a typical API request
      const { getUser } = await import('../getUser');
      const { handleApiError } = await import('../handleApiError');

      // Mock successful user extraction
      const mockEvent = {
        context: {
          user: {
            userId: 123,
            jwtKey: 'test-key',
            iat: 1234567890,
            exp: 1234567890 + 3600,
          },
        },
      };

      const user = getUser(mockEvent as any);
      expect(user.userId).toBe(123);

      // Test error handling with Zod validation
      const validationError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['accountId'],
          message: 'Expected string, received number',
        },
      ]);

      expect(() => handleApiError(validationError)).toThrow('HTTP 400: accountId: Expected string, received number');
    });
  });
});
