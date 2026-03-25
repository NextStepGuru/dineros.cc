import QueueManager, { type QueueRegistryConfig } from "../lib/queueManager";
import type { JobsOptions } from "bullmq";
import type { BackupJob } from "../queues/backupQueue";
import backup from "../queues/backupQueue";
import type { RecalculateJob } from "../queues/recalculateQueue";
import recalculate from "../queues/recalculateQueue";
import { sharedRedisConnection } from "../clients/redisClient";
import { log } from "../logger";
import type { PlaidSyncJob } from "../queues/plaidSyncQueue";
import plaidSync from "../queues/plaidSyncQueue";
import type { PlaidSyncBalanceJob } from "../queues/plaidSyncBalanceQueue";
import plaidBalanceSync from "../queues/plaidSyncBalanceQueue";

export const queueConfigs = [
  { name: backup.queueName, processor: backup.processor },
  { name: recalculate.queueName, processor: recalculate.processor },
  { name: plaidSync.queueName, processor: plaidSync.processor },
  { name: plaidBalanceSync.queueName, processor: plaidBalanceSync.processor },
] as QueueRegistryConfig[];

log({ message: `BullMQ Queues: ${queueConfigs.length}`, level: "info" });
export const queueManager = new QueueManager(
  queueConfigs,
  sharedRedisConnection,
);

if (!queueManager.isDisabled()) {
  try {
    await queueManager.start();
  } catch (error) {
    log({
      message: "Failed to initialize queues",
      data: error,
      level: "error",
    });
  }
}

export const addBackupJob = (data: BackupJob) =>
  queueManager.addJob(backup.queueName, data);

export const addRecalculateJob = (data: RecalculateJob) =>
  queueManager.addJob(recalculate.queueName, data, {
    attempts: 0,
    delay: 5 * 60 * 1000, // 5 minutes
    jobId: data.accountId,
    removeOnComplete: true,
    removeOnFail: false,
    keepLogs: 4,
  });

export const addPlaidSyncJob = (data: PlaidSyncJob, opts?: JobsOptions) =>
  queueManager.addJob(plaidSync.queueName, data, {
    attempts: 0,
    delay: 30 * 60 * 1000, // 30 minutes
    jobId:
      `${data.name || ""}${data.accountRegisterId ?? ""}${data.itemId ?? ""}` ||
      "PlaidSync",
    removeOnComplete: true,
    removeOnFail: false,
    keepLogs: 4,
    ...opts,
  });

export const addPlaidBalanceSyncJob = (data: PlaidSyncBalanceJob) =>
  queueManager.addJob(plaidBalanceSync.queueName, data, {
    attempts: 0,
    delay: 10 * 1000, // 10 seconds
    removeOnComplete: true,
    removeOnFail: false,
    jobId: `plaid-balance-sync-${data.accountRegisterId}`,
    keepLogs: 4,
  });
