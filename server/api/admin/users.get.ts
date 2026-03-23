import { defineEventHandler, getQuery } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { adminUsersQuerySchema } from "~/schema/zod";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";
import { isAdminEmail } from "~/server/lib/adminConfig";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const query = adminUsersQuerySchema.parse(getQuery(event));
    const search = query.q.trim();
    const searchId = Number.parseInt(search, 10);
    const isNumericSearch = Number.isInteger(searchId) && searchId > 0;

    const where = search
      ? {
          OR: [
            { email: { contains: search } },
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            ...(isNumericSearch ? [{ id: searchId }] : []),
          ],
        }
      : undefined;

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          isArchived: true,
          updatedAt: true,
          countryId: true,
          timezoneOffset: true,
          isDaylightSaving: true,
          _count: {
            select: {
              accounts: true,
            },
          },
        } as any,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      items: rows.map((row: any) => ({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        role: row.role === "ADMIN" || isAdminEmail(row.email) ? "ADMIN" : "USER",
        isArchived: Boolean(row.isArchived),
        countryId: row.countryId ?? null,
        timezoneOffset: row.timezoneOffset ?? null,
        isDaylightSaving: row.isDaylightSaving ?? null,
        updatedAt: row.updatedAt,
        accountCount: row._count?.accounts ?? 0,
      })),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
