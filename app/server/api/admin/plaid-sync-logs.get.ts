import type { Prisma } from "@prisma/client";
import { getQuery } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { adminPlaidSyncLogsQuerySchema } from "~/schema/zod";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const q = adminPlaidSyncLogsQuerySchema.parse(getQuery(event));

    const where: Prisma.PlaidSyncLogWhereInput = {};
    if (q.syncMode) {
      where.syncMode = q.syncMode;
    }
    if (q.status) {
      where.status = q.status;
    }
    if (q.userId != null) {
      where.userId = q.userId;
    }

    const [rows, total] = await Promise.all([
      prisma.plaidSyncLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: q.limit,
        skip: q.offset,
      }),
      prisma.plaidSyncLog.count({ where }),
    ]);

    return {
      items: rows,
      total,
      limit: q.limit,
      offset: q.offset,
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
