import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { createError, getQuery, getRouterParam } from "h3";
import { getUser } from "~/server/lib/getUser";
import { z } from "zod";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const { userId } = getUser(event);
    const id = getRouterParam(event, "id");
    if (!id?.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: "Register entry id is required",
      });
    }

    const querySchema = z.object({
      accountRegisterId: z.coerce.number().refine((val) => val !== 0, {
        message: "Account register ID is required",
      }),
    });
    const query = querySchema.parse(getQuery(event));

    const row = await PrismaDb.registerEntry.findFirst({
      where: {
        id,
        accountRegisterId: query.accountRegisterId,
        register: {
          account: {
            userAccounts: {
              some: { userId },
            },
          },
        },
      },
      select: {
        plaidJson: true,
        plaidId: true,
        updatedAt: true,
        isPending: true,
      },
    });

    if (!row) {
      throw createError({
        statusCode: 404,
        statusMessage: "Register entry not found",
      });
    }

    if (row.plaidId == null || row.plaidId === "") {
      throw createError({
        statusCode: 400,
        statusMessage: "This entry is not linked to a Plaid transaction",
      });
    }

    return {
      plaidJson: row.plaidJson ?? null,
      plaidId: row.plaidId,
      updatedAt: row.updatedAt.toISOString(),
      isPending: row.isPending,
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
