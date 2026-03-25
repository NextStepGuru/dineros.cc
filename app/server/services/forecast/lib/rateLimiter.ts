/**
 * Rate limiter utility to control database concurrency during forecast operations
 */
export class DatabaseRateLimiter {
  private semaphore: number;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number = 3) {
    this.semaphore = maxConcurrent;
  }

  /**
   * Execute an array of async operations with rate limiting
   */
  async executeWithLimit<T>(
    operations: Array<() => Promise<T>>
  ): Promise<T[]> {
    return Promise.all(
      operations.map((operation) => this.acquire(operation))
    );
  }

  /**
   * Execute operations in batches with rate limiting
   */
  async executeBatched<T>(
    operations: Array<() => Promise<T>>,
    batchSize: number = this.maxConcurrent
  ): Promise<T[]> {
    const results: T[] = [];

    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((operation) => this.acquire(operation))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Acquire a semaphore slot and execute the operation
   */
  private async acquire<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const executeOperation = async () => {
        try {
          const result = await operation();
          this.release();
          resolve(result);
        } catch (error) {
          this.release();
          reject(error);
        }
      };

      if (this.semaphore > 0) {
        this.semaphore--;
        executeOperation();
      } else {
        this.queue.push(executeOperation);
      }
    });
  }

  /**
   * Release a semaphore slot and process queue
   */
  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    } else {
      this.semaphore++;
    }
  }

  /**
   * Get current status for debugging
   */
  getStatus() {
    return {
      available: this.semaphore,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }
}
