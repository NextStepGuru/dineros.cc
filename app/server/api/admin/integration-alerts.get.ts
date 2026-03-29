import type { Prisma } from "@prisma/client";
import { defineEventHandler, getQuery, setHeader } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { adminIntegrationAlertsQuerySchema } from "~/schema/zod";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";
import { parseOptionalIsoQuery } from "~/server/lib/parseOptionalIsoQuery";
import { csvEscape } from "~/server/lib/csvEscape";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const q = adminIntegrationAlertsQuerySchema.parse(getQuery(event));

    const where: Prisma.IntegrationAlertWhereInput = {};

    if (q.source !== "all") {
      where.source = q.source;
    }

    if (q.kind?.trim()) {
      where.kind = { contains: q.kind.trim() };
    }

    const fromD = parseOptionalIsoQuery(q.from);
    const toD = parseOptionalIsoQuery(q.to);
    if (fromD || toD) {
      where.createdAt = {};
      if (fromD) where.createdAt.gte = fromD;
      if (toD) where.createdAt.lte = toD;
    }

    if (q.format === "csv") {
      const rows = await prisma.integrationAlert.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 5000,
      });

      const header =
        "id,createdAt,source,kind,message,httpStatus,dedupeKey";
      const lines = rows.map((r) =>
        [
          r.id,
          r.createdAt.toISOString(),
          r.source,
          r.kind,
          csvEscape((r.message ?? "").replace(/\r?\n/g, " ")),
          r.httpStatus ?? "",
          r.dedupeKey ?? "",
        ].join(","),
      );

      setHeader(event, "content-type", "text/csv; charset=utf-8");
      setHeader(
        event,
        "content-disposition",
        'attachment; filename="integration-alerts.csv"',
      );
      return [header, ...lines].join("\n");
    }

    const [rows, total] = await Promise.all([
      prisma.integrationAlert.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: q.limit,
        skip: q.offset,
      }),
      prisma.integrationAlert.count({ where }),
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
