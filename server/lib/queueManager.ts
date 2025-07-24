import type { JobsOptions } from "bullmq";
import type Redis from "ioredis";
import { dateTimeService } from "../services/forecast/DateTimeService";

interface QueueConfig {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  processor: (job: any) => Promise<void>;
}

class QueueManager {
  queues: Map<string, any> = new Map();
  workers: Map<string, any> = new Map();
  connection: Redis | null;
  isTestMode: boolean;

  constructor(private queueConfigs: QueueConfig[], connection: Redis) {
    this.connection = connection;
    this.isTestMode = process.env.NODE_ENV === "test";

    if (!this.isTestMode) {
      // Initialize queues asynchronously
      this.initializeQueues().catch((error) => {
        console.error("Failed to initialize queues:", error);
      });
    }
  }

  private async initializeQueues() {
    // Only import BullMQ in non-test mode to avoid connection attempts
    const { Queue, Worker } = await import("bullmq");

    for (const config of this.queueConfigs) {
      if (this.connection) {
        const queue = new Queue(config.name, { connection: this.connection });
        const worker = new Worker(config.name, config.processor, {
          connection: this.connection,
        });

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
      } as any);
    }

    const queue = this.queues.get(queueName);
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
