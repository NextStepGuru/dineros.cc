import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError, getRouterParam, readBody } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { cashOnHandSchema } from "~/schema/zod";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const idParam = getRouterParam(event, "registerId");
    const registerId = idParam
      ? Number.parseInt(idParam, 10)
      : Number.NaN;
    if (!Number.isInteger(registerId) || registerId < 1) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid account register id",
      });
    }

    const register = await PrismaDb.accountRegister.findFirst({
      where: {
        id: registerId,
        isArchived: false,
        account: {
          userAccounts: { some: { userId } },
        },
      },
      select: {
        id: true,
        type: { select: { type: true } },
      },
    });

    if (!register) {
      throw createError({
        statusCode: 404,
        statusMessage: "Account register not found",
      });
    }

    if (register.type.type !== "cash") {
      throw createError({
        statusCode: 403,
        statusMessage: "Cash count is only available for Cash account registers.",
      });
    }

    const body = await readBody(event);
    const data = cashOnHandSchema.parse(body);

    await PrismaDb.cashOnHand.upsert({
      where: { accountRegisterId: registerId },
      create: {
        accountRegisterId: registerId,
        ...data,
      },
      update: data,
    });

    return { ok: true as const };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
