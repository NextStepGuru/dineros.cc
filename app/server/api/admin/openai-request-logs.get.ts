import type { Prisma } from "@prisma/client";
import { defineEventHandler, getQuery, setHeader } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { adminOpenAiRequestLogsQuerySchema } from "~/schema/zod";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";
import { parseOptionalIsoQuery } from "~/server/lib/parseOptionalIsoQuery";

function csvEscape(s: string) {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const q = adminOpenAiRequestLogsQuerySchema.parse(getQuery(event));

    const where: Prisma.OpenAiRequestLogWhereInput = {};

    if (q.purpose?.trim()) {
      where.purpose = { contains: q.purpose.trim() };
    }

    if (q.success === "true") where.success = true;
    if (q.success === "false") where.success = false;

    const fromD = parseOptionalIsoQuery(q.from);
    const toD = parseOptionalIsoQuery(q.to);
    if (fromD || toD) {
      where.createdAt = {};
      if (fromD) where.createdAt.gte = fromD;
      if (toD) where.createdAt.lte = toD;
    }

    if (q.format === "csv") {
      const rows = await prisma.openAiRequestLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 5000,
        select: {
          id: true,
          createdAt: true,
          purpose: true,
          model: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          cachedPromptTokens: true,
          durationMs: true,
          success: true,
          errorMessage: true,
          httpStatus: true,
        },
      });

      const header = [
        "id",
        "createdAt",
        "purpose",
        "model",
        "promptTokens",
        "completionTokens",
        "totalTokens",
        "cachedPromptTokens",
        "durationMs",
        "success",
        "errorMessage",
        "httpStatus",
      ].join(",");

      const lines = rows.map((r) =>
        [
          r.id,
          r.createdAt.toISOString(),
          r.purpose,
          r.model,
          r.promptTokens ?? "",
          r.completionTokens ?? "",
          r.totalTokens ?? "",
          r.cachedPromptTokens ?? "",
          r.durationMs,
          r.success,
          csvEscape((r.errorMessage ?? "").replace(/\r?\n/g, " ")),
          r.httpStatus ?? "",
        ].join(","),
      );

      setHeader(event, "content-type", "text/csv; charset=utf-8");
      setHeader(
        event,
        "content-disposition",
        'attachment; filename="openai-request-logs.csv"',
      );
      return [header, ...lines].join("\n");
    }

    const [rows, total] = await Promise.all([
      prisma.openAiRequestLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: q.limit,
        skip: q.offset,
      }),
      prisma.openAiRequestLog.count({ where }),
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
