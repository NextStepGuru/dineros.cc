import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError, getRouterParam } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";

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
        name: true,
        accountId: true,
      },
    });

    if (!register) {
      throw createError({
        statusCode: 404,
        statusMessage: "Account register not found",
      });
    }

    let row = await PrismaDb.cashOnHand.findUnique({
      where: { accountRegisterId: registerId },
    });

    if (!row) {
      row = await PrismaDb.cashOnHand.create({
        data: {
          accountRegisterId: registerId,
        },
      });
    }

    return {
      registerId: register.id,
      registerName: register.name,
      accountId: register.accountId,
      ones: row.ones,
      fives: row.fives,
      tens: row.tens,
      twenties: row.twenties,
      fifties: row.fifties,
      hundreds: row.hundreds,
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
