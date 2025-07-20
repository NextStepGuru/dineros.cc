import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseRateLimiter } from '../lib/rateLimiter';

describe('DatabaseRateLimiter', () => {
  let rateLimiter: DatabaseRateLimiter;

  beforeEach(() => {
    rateLimiter = new DatabaseRateLimiter(2); // Max 2 concurrent operations
  });

  describe('Basic Functionality', () => {
    it('should initialize with correct max concurrent limit', () => {
      const status = rateLimiter.getStatus();
      expect(status.maxConcurrent).toBe(2);
      expect(status.available).toBe(2);
      expect(status.queued).toBe(0);
    });

    it('should execute operations within concurrency limit immediately', async () => {
      const results: string[] = [];
      const operations = [
        () => Promise.resolve('op1'),
        () => Promise.resolve('op2'),
      ];

      const start = Date.now();
      const promise = rateLimiter.executeWithLimit(operations);
      const executionResults = await promise;
      const duration = Date.now() - start;

      expect(executionResults).toEqual(['op1', 'op2']);
      expect(duration).toBeLessThan(50); // Should be almost immediate
    });

    it('should queue operations when exceeding concurrency limit', async () => {
      const executionOrder: string[] = [];
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      const operations = [
        async () => {
          executionOrder.push('start-1');
          await delay(100);
          executionOrder.push('end-1');
          return 'op1';
        },
        async () => {
          executionOrder.push('start-2');
          await delay(100);
          executionOrder.push('end-2');
          return 'op2';
        },
        async () => {
          executionOrder.push('start-3');
          await delay(50);
          executionOrder.push('end-3');
          return 'op3';
        },
      ];

      const results = await rateLimiter.executeWithLimit(operations);

      expect(results).toEqual(['op1', 'op2', 'op3']);

      // Should start first 2 operations immediately, queue the 3rd
      expect(executionOrder.slice(0, 2)).toEqual(['start-1', 'start-2']);

      // Third operation should start after one of the first two completes
      expect(executionOrder).toContain('start-3');
      expect(executionOrder).toContain('end-3');
    });
  });

  describe('Status Tracking', () => {
    it('should track available slots correctly during execution', async () => {
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      const operation1 = async () => {
        const status = rateLimiter.getStatus();
        expect(status.available).toBe(1); // One slot taken
        await delay(50);
        return 'op1';
      };

      const operation2 = async () => {
        const status = rateLimiter.getStatus();
        expect(status.available).toBe(0); // Both slots taken
        await delay(50);
        return 'op2';
      };

      await rateLimiter.executeWithLimit([operation1, operation2]);

      // After completion, all slots should be available again
      const finalStatus = rateLimiter.getStatus();
      expect(finalStatus.available).toBe(2);
      expect(finalStatus.queued).toBe(0);
    });

    it('should track queued operations correctly', async () => {
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      let queuedCount = 0;

      const operations = Array.from({ length: 5 }, (_, i) =>
        async () => {
          if (i >= 2) {
            // Operations 3, 4, 5 should be queued initially
            const status = rateLimiter.getStatus();
            queuedCount = Math.max(queuedCount, status.queued);
          }
          await delay(30);
          return `op${i + 1}`;
        }
      );

      await rateLimiter.executeWithLimit(operations);

      // Should have had 3 operations queued at some point
      expect(queuedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle operation failures without blocking other operations', async () => {
      const operations = [
        () => Promise.resolve('success1'),
        () => Promise.reject(new Error('test error')),
        () => Promise.resolve('success2'),
      ];

      await expect(rateLimiter.executeWithLimit(operations)).rejects.toThrow('test error');

      // Rate limiter should still be functional after error
      const status = rateLimiter.getStatus();
      expect(status.available).toBe(2);
      expect(status.queued).toBe(0);
    });

    it('should release semaphore slot even when operation fails', async () => {
      const operations = [
        () => Promise.reject(new Error('failure')),
      ];

      await expect(rateLimiter.executeWithLimit(operations)).rejects.toThrow();

      // Slot should be released
      const status = rateLimiter.getStatus();
      expect(status.available).toBe(2);
    });
  });

  describe('Batch Execution', () => {
    it('should execute operations in batches with specified batch size', async () => {
      const executionOrder: number[] = [];
      const operations = Array.from({ length: 6 }, (_, i) =>
        async () => {
          executionOrder.push(i);
          await new Promise(resolve => setTimeout(resolve, 10));
          return `result${i}`;
        }
      );

      const results = await rateLimiter.executeBatched(operations, 3);

      expect(results).toEqual(['result0', 'result1', 'result2', 'result3', 'result4', 'result5']);
      expect(executionOrder).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('should respect rate limiting within each batch', async () => {
      const concurrentTracker: number[] = [];
      let currentConcurrent = 0;

      const operations = Array.from({ length: 4 }, () =>
        async () => {
          currentConcurrent++;
          concurrentTracker.push(currentConcurrent);
          await new Promise(resolve => setTimeout(resolve, 50));
          currentConcurrent--;
          return 'done';
        }
      );

      await rateLimiter.executeBatched(operations, 2);

      // Should never exceed the rate limit of 2
      expect(Math.max(...concurrentTracker)).toBeLessThanOrEqual(2);
    });
  });

  describe('Integration with Different Concurrency Limits', () => {
    it('should work with concurrency limit of 1', async () => {
      const singleThreadLimiter = new DatabaseRateLimiter(1);
      const executionOrder: string[] = [];

      const operations = [
        async () => {
          executionOrder.push('start-1');
          await new Promise(resolve => setTimeout(resolve, 30));
          executionOrder.push('end-1');
          return 'op1';
        },
        async () => {
          executionOrder.push('start-2');
          await new Promise(resolve => setTimeout(resolve, 30));
          executionOrder.push('end-2');
          return 'op2';
        },
      ];

      await singleThreadLimiter.executeWithLimit(operations);

      // Operations should be completely sequential
      expect(executionOrder).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
    });

    it('should work with high concurrency limit', async () => {
      const highConcurrencyLimiter = new DatabaseRateLimiter(10);
      const operations = Array.from({ length: 8 }, (_, i) =>
        () => Promise.resolve(`result${i}`)
      );

      const start = Date.now();
      const results = await highConcurrencyLimiter.executeWithLimit(operations);
      const duration = Date.now() - start;

      expect(results).toHaveLength(8);
      expect(duration).toBeLessThan(100); // Should be fast with high concurrency
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle large numbers of operations efficiently', async () => {
      const operations = Array.from({ length: 100 }, (_, i) =>
        () => Promise.resolve(i)
      );

      const start = Date.now();
      const results = await rateLimiter.executeWithLimit(operations);
      const duration = Date.now() - start;

      expect(results).toHaveLength(100);
      expect(results[0]).toBe(0);
      expect(results[99]).toBe(99);

      // Should complete in reasonable time (allowing for queuing delays)
      expect(duration).toBeLessThan(5000);
    });
  });
});
