import type { Prisma } from "@prisma/client";
import { getQuery } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { adminIntegrationJobLogsQuerySchema } from "~/schema/zod";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const q = adminIntegrationJobLogsQuerySchema.parse(getQuery(event));

    const where: Prisma.IntegrationJobLogWhereInput = {};
    if (q.source?.trim()) {
      where.source = { contains: q.source.trim() };
    }

    const [rows, total] = await Promise.all([
      prisma.integrationJobLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: q.limit,
        skip: q.offset,
      }),
      prisma.integrationJobLog.count({ where }),
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
