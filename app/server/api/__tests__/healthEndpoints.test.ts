import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
});

vi.mock('h3', () => ({
  defineEventHandler: vi.fn((handler) => handler),
}));

vi.mock('~/server/clients/prismaClient', () => ({
  isPrismaActive: vi.fn(),
}));

vi.mock('~/server/clients/redisClient', () => ({
  checkRedisConnection: vi.fn(),
}));

describe('Health API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/_ah/liveness', () => {
    let livenessHandler: any;

    beforeEach(async () => {
      const module = await import('../_ah/liveness');
      livenessHandler = module.default;
    });

    it('should return status and database/redis when both are up', async () => {
      const { isPrismaActive } = await import('~/server/clients/prismaClient');
      const { checkRedisConnection } = await import('~/server/clients/redisClient');
      (isPrismaActive as any).mockResolvedValue(true);
      (checkRedisConnection as any).mockResolvedValue(true);

      const result = await livenessHandler();

      expect(result).toEqual({
        status: 'Liveness check passed',
        database: true,
        redis: true,
      });
    });

    it('should return database false when isPrismaActive fails', async () => {
      const { isPrismaActive } = await import('~/server/clients/prismaClient');
      const { checkRedisConnection } = await import('~/server/clients/redisClient');
      (isPrismaActive as any).mockResolvedValue(false);
      (checkRedisConnection as any).mockResolvedValue(true);

      const result = await livenessHandler();

      expect(result).toEqual({
        status: 'Liveness check passed',
        database: false,
        redis: true,
      });
    });

    it('should return redis false when checkRedisConnection fails', async () => {
      const { isPrismaActive } = await import('~/server/clients/prismaClient');
      const { checkRedisConnection } = await import('~/server/clients/redisClient');
      (isPrismaActive as any).mockResolvedValue(true);
      (checkRedisConnection as any).mockResolvedValue(false);

      const result = await livenessHandler();

      expect(result).toEqual({
        status: 'Liveness check passed',
        database: true,
        redis: false,
      });
    });
  });

  describe('GET /api/_ah/readiness', () => {
    let readinessHandler: any;

    beforeEach(async () => {
      const module = await import('../_ah/readiness');
      readinessHandler = module.default;
    });

    it('should return status and database/redis when both are up', async () => {
      const { isPrismaActive } = await import('~/server/clients/prismaClient');
      const { checkRedisConnection } = await import('~/server/clients/redisClient');
      (isPrismaActive as any).mockResolvedValue(true);
      (checkRedisConnection as any).mockResolvedValue(true);

      const result = await readinessHandler();

      expect(result).toEqual({
        status: 'Readiness check passed',
        database: true,
        redis: true,
      });
    });

    it('should return database false when isPrismaActive fails', async () => {
      const { isPrismaActive } = await import('~/server/clients/prismaClient');
      const { checkRedisConnection } = await import('~/server/clients/redisClient');
      (isPrismaActive as any).mockResolvedValue(false);
      (checkRedisConnection as any).mockResolvedValue(true);

      const result = await readinessHandler();

      expect(result).toEqual({
        status: 'Readiness check passed',
        database: false,
        redis: true,
      });
    });
  });
});
