import { defineEventHandler, getQuery } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { adminAccountsQuerySchema } from "~/schema/zod";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const query = adminAccountsQuerySchema.parse(getQuery(event));
    const search = query.q.trim();

    const where = search
      ? {
          OR: [
            { id: { contains: search } },
            { name: { contains: search } },
            {
              userAccounts: {
                some: {
                  user: {
                    email: { contains: search },
                  },
                },
              },
            },
          ],
        }
      : undefined;

    const [rows, total] = await Promise.all([
      prisma.account.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          name: true,
          isArchived: true,
          updatedAt: true,
          _count: {
            select: {
              userAccounts: true,
            },
          },
        },
      }),
      prisma.account.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        isArchived: row.isArchived,
        updatedAt: row.updatedAt,
        memberCount: row._count.userAccounts,
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
