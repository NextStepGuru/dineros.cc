import { defineEventHandler, getQuery } from "h3";
import { z } from "zod";
import { prisma } from "~/server/clients/prismaClient";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const q = querySchema.parse(getQuery(event));

    const [rows, total] = await Promise.all([
      prisma.openAiRequestLog.findMany({
        orderBy: { createdAt: "desc" },
        take: q.limit,
        skip: q.offset,
      }),
      prisma.openAiRequestLog.count(),
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
