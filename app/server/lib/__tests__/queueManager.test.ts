import { describe, it, expect, beforeEach, vi } from 'vitest';
import QueueManager from '../queueManager';

// Mock Redis connection
const mockRedisConnection = {} as any;

describe('QueueManager', () => {
  const mockQueueConfigs = [
    {
      name: 'test-queue',
      processor: vi.fn(),
    },
  ];

  beforeEach(() => {
    // Ensure we're in test mode
    process.env.NODE_ENV = 'test';
  });

  it('should disable queues in test mode', () => {
    const queueManager = new QueueManager(mockQueueConfigs, mockRedisConnection);

    expect(queueManager.isDisabled()).toBe(true);
    expect(queueManager.queues.size).toBe(0);
    expect(queueManager.workers.size).toBe(0);
  });

  it('should return mock job in test mode when adding jobs', async () => {
    const queueManager = new QueueManager(mockQueueConfigs, mockRedisConnection);

    const mockJob = await queueManager.addJob('test-queue', { test: 'data' });

    expect(mockJob).toHaveProperty('id');
    expect(mockJob).toHaveProperty('name', 'test-queue');
    expect(mockJob).toHaveProperty('data', { test: 'data' });
    expect(mockJob.id).toMatch(/^test-job-\d+$/);
  });

  it('should enable queues in non-test mode', () => {
    // Temporarily set to development
    process.env.NODE_ENV = 'development';

    const queueManager = new QueueManager(mockQueueConfigs, mockRedisConnection);

    expect(queueManager.isDisabled()).toBe(false);

    // Reset to test
    process.env.NODE_ENV = 'test';
  });
});
