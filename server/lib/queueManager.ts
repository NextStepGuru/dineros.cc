/* eslint-disable no-unused-vars */
import type { Job, JobsOptions } from "bullmq";
import type Redis from "ioredis";
import { dateTimeService } from "../services/forecast/DateTimeService";

/**
 * Registry entry for BullMQ: each worker only runs jobs for its queue, but TypeScript
 * cannot express a heterogeneous list of per-payload processors without contravariance errors.
 */
export type QueueRegistryConfig = {
  name: string;
  processor: (job: Job<unknown, any, string>) => Promise<void>;
};

class QueueManager {
  queues: Map<string, unknown> = new Map();
  workers: Map<string, unknown> = new Map();
  connection: Redis | null;
  isTestMode: boolean;
  queueConfigs: QueueRegistryConfig[];
  private initialized = false;

  constructor(queueConfigs: QueueRegistryConfig[], connection: Redis) {
    this.queueConfigs = queueConfigs;
    this.connection = connection;
    this.isTestMode = process.env.NODE_ENV === "test";
  }

  /** Call after construction (e.g. from module scope); no-op in test mode. */
  public async start(): Promise<void> {
    if (this.isTestMode || this.initialized) {
      return;
    }
    await this.initializeQueues();
    this.initialized = true;
  }

  private async initializeQueues() {
    // Only import BullMQ in non-test mode to avoid connection attempts
    const { Queue, Worker } = await import("bullmq");

    for (const config of this.queueConfigs) {
      if (this.connection) {
        // Cast: app ioredis patch can differ from BullMQ's peer; compatible at runtime
        const connection = this.connection as import("bullmq").ConnectionOptions;
        const queue = new Queue(config.name, { connection });
        const worker = new Worker(config.name, config.processor, { connection });

        this.queues.set(config.name, queue);
        this.workers.set(config.name, worker);
      }
    }
  }

  public addJob(queueName: string, data: unknown, opts?: JobsOptions) {
    // In test mode, just return a mock job object
    if (this.isTestMode) {
      return Promise.resolve({
        id: `test-job-${dateTimeService.nowDate().getTime()}`,
        name: queueName,
        data,
        opts,
      } as const);
    }

    const queue = this.queues.get(queueName) as import("bullmq").Queue | undefined;
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    return queue.add(queueName, data, opts);
  }

  // Method to check if queues are disabled (for testing)
  public isDisabled(): boolean {
    return this.isTestMode;
  }
}

export default QueueManager;
