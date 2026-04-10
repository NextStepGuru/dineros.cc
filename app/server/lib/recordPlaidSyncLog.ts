import type { Prisma } from "@prisma/client";
import { prisma } from "~/server/clients/prismaClient";
import { log } from "~/server/logger";

const ERROR_SUMMARY_MAX = 8000;

export async function recordPlaidSyncLog(entry: {
  syncMode: string;
  status: string;
  itemId?: string | null;
  userId?: number | null;
  durationMs?: number | null;
  txAdded?: number;
  txModified?: number;
  txRemoved?: number;
  newEntries?: number;
  matchedEntries?: number;
  errorCount?: number;
  errorSummary?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    const summary = entry.errorSummary?.slice(0, ERROR_SUMMARY_MAX) ?? null;
    await prisma.plaidSyncLog.create({
      data: {
        syncMode: entry.syncMode,
        status: entry.status,
        itemId: entry.itemId ?? null,
        userId: entry.userId ?? null,
        durationMs: entry.durationMs ?? null,
        txAdded: entry.txAdded ?? 0,
        txModified: entry.txModified ?? 0,
        txRemoved: entry.txRemoved ?? 0,
        newEntries: entry.newEntries ?? 0,
        matchedEntries: entry.matchedEntries ?? 0,
        errorCount: entry.errorCount ?? 0,
        errorSummary: summary,
        metadata: entry.metadata ?? undefined,
      },
    });
  } catch (error) {
    log({
      level: "error",
      message: "Failed to record Plaid sync log",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
  }
}
