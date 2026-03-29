import type { Prisma } from "@prisma/client";
import { prisma } from "~/server/clients/prismaClient";
import { log } from "~/server/logger";

export async function recordIntegrationJobLog(entry: {
  source: string;
  queueName: string;
  jobId?: string | null;
  message: string;
  itemId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.integrationJobLog.create({
      data: {
        source: entry.source,
        queueName: entry.queueName,
        jobId: entry.jobId ?? null,
        message: entry.message.slice(0, 8000),
        itemId: entry.itemId ?? null,
        metadata: entry.metadata ?? undefined,
      },
    });
  } catch (error) {
    log({
      level: "error",
      message: "Failed to record integration job log",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
  }
}
