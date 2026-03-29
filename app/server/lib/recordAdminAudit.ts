import type { H3Event, EventHandlerRequest } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { log } from "~/server/logger";

export async function recordAdminAudit(
  event: H3Event<EventHandlerRequest>,
  entry: {
    action: string;
    targetUserId?: number | null;
    targetAccountId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    const { userId } = getUser(event);
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: userId,
        action: entry.action,
        targetUserId: entry.targetUserId ?? null,
        targetAccountId: entry.targetAccountId ?? null,
        metadata: entry.metadata ?? undefined,
      },
    });
  } catch (error) {
    log({
      level: "error",
      message: "Failed to record admin audit",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
  }
}
