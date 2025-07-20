import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ForecastEngineFactory, ForecastEngine } from '../index';

// Mock the PrismaClient
const mockPrismaClient = {
  // Add minimal mock structure
} as any;

describe('ForecastEngineFactory', () => {
  beforeEach(() => {
    // Mock console.log to avoid test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('should create a ForecastEngine instance', () => {
      const engine = ForecastEngineFactory.create(mockPrismaClient);

      expect(engine).toBeInstanceOf(ForecastEngine);
      expect(engine).toBeDefined();
    });

    it('should create different instances on multiple calls', () => {
      const engine1 = ForecastEngineFactory.create(mockPrismaClient);
      const engine2 = ForecastEngineFactory.create(mockPrismaClient);

      expect(engine1).not.toBe(engine2);
      expect(engine1).toBeInstanceOf(ForecastEngine);
      expect(engine2).toBeInstanceOf(ForecastEngine);
    });
  });

  describe('createWithCustomServices', () => {
    it('should create a ForecastEngine instance with no custom services', () => {
      const engine = ForecastEngineFactory.createWithCustomServices(mockPrismaClient);

      expect(engine).toBeInstanceOf(ForecastEngine);
      expect(engine).toBeDefined();
    });

    it('should create a ForecastEngine instance with empty custom services object', () => {
      const engine = ForecastEngineFactory.createWithCustomServices(mockPrismaClient, {});

      expect(engine).toBeInstanceOf(ForecastEngine);
      expect(engine).toBeDefined();
    });

    it('should create different instances on multiple calls with custom services', () => {
      const engine1 = ForecastEngineFactory.createWithCustomServices(mockPrismaClient, {});
      const engine2 = ForecastEngineFactory.createWithCustomServices(mockPrismaClient, {});

      expect(engine1).not.toBe(engine2);
      expect(engine1).toBeInstanceOf(ForecastEngine);
      expect(engine2).toBeInstanceOf(ForecastEngine);
    });
  });
});
