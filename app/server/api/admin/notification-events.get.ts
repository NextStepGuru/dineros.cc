import type { Prisma } from "@prisma/client";
import { getQuery } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { adminNotificationEventsQuerySchema } from "~/schema/zod";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";
import { parseOptionalIsoQuery } from "~/server/lib/parseOptionalIsoQuery";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const q = adminNotificationEventsQuerySchema.parse(getQuery(event));

    const where: Prisma.NotificationEventWhereInput = {};

    if (q.userId != null) where.userId = q.userId;
    if (q.budgetId != null) where.budgetId = q.budgetId;
    if (q.kind != null) where.kind = q.kind;

    if (q.isActive === "true") where.isActive = true;
    if (q.isActive === "false") where.isActive = false;

    const fromD = parseOptionalIsoQuery(q.from);
    const toD = parseOptionalIsoQuery(q.to);
    if (fromD || toD) {
      where.lastSeenAt = {};
      if (fromD) where.lastSeenAt.gte = fromD;
      if (toD) where.lastSeenAt.lte = toD;
    }

    const [rows, total] = await Promise.all([
      prisma.notificationEvent.findMany({
        where,
        orderBy: { lastSeenAt: "desc" },
        take: q.limit,
        skip: q.offset,
        include: {
          user: { select: { id: true, email: true } },
          budget: { select: { id: true, name: true } },
        },
      }),
      prisma.notificationEvent.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        budgetId: r.budgetId,
        kind: r.kind,
        fingerprint: r.fingerprint,
        occurrenceKey: r.occurrenceKey,
        isActive: r.isActive,
        payload: r.payload,
        firstSeenAt: r.firstSeenAt,
        lastSeenAt: r.lastSeenAt,
        resolvedAt: r.resolvedAt,
        updatedAt: r.updatedAt,
        userEmail: r.user.email,
        budgetName: r.budget.name,
      })),
      total,
      limit: q.limit,
      offset: q.offset,
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
