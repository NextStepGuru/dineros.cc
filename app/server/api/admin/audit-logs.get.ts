import type { Prisma } from "@prisma/client";
import { getQuery, setHeader } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { adminAuditLogsQuerySchema } from "~/schema/zod";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";
import { csvEscape } from "~/server/lib/csvEscape";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const query = adminAuditLogsQuerySchema.parse(getQuery(event));

    const where: Prisma.AdminAuditLogWhereInput = {};
    if (query.action?.trim()) {
      where.action = { contains: query.action.trim() };
    }
    if (query.adminUserId != null) {
      where.adminUserId = query.adminUserId;
    }
    if (query.targetUserId != null) {
      where.targetUserId = query.targetUserId;
    }

    if (query.format === "csv") {
      const rows = await prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 5000,
        select: {
          id: true,
          adminUserId: true,
          action: true,
          targetUserId: true,
          targetAccountId: true,
          metadata: true,
          createdAt: true,
        },
      });
      const header =
        "id,createdAt,adminUserId,action,targetUserId,targetAccountId,metadataJson";
      const lines = rows.map((r) =>
        [
          r.id,
          r.createdAt.toISOString(),
          r.adminUserId,
          r.action,
          r.targetUserId ?? "",
          r.targetAccountId ?? "",
          csvEscape(JSON.stringify(r.metadata ?? null)),
        ].join(","),
      );
      setHeader(event, "content-type", "text/csv; charset=utf-8");
      setHeader(
        event,
        "content-disposition",
        'attachment; filename="admin-audit-log.csv"',
      );
      return [header, ...lines].join("\n");
    }

    const [rows, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          adminUserId: true,
          action: true,
          targetUserId: true,
          targetAccountId: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    return {
      items: rows,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
