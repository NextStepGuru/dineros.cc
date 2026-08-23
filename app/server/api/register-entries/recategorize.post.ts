import { z } from "zod";
import { createError } from "h3";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { budgetWhereForAccountMember } from "~/server/lib/accountAccess";
import TransactionCategorizationService from "~/server/services/TransactionCategorizationService";

const recategorizeBodySchema = z.object({
  budgetId: z.coerce.number().int().positive(),
  accountRegisterId: z.coerce.number().int().positive().optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const body = recategorizeBodySchema.parse(await readBody(event));

    const budget = await PrismaDb.budget.findFirst({
      where: budgetWhereForAccountMember(user.userId, body.budgetId),
      select: { id: true, accountId: true },
    });
    if (!budget) {
      throw createError({
        statusCode: 404,
        statusMessage: "Budget not found",
      });
    }

    if (body.accountRegisterId) {
      const register = await PrismaDb.accountRegister.findFirst({
        where: {
          id: body.accountRegisterId,
          budgetId: budget.id,
          accountId: budget.accountId,
        },
        select: { id: true },
      });
      if (!register) {
        throw createError({
          statusCode: 404,
          statusMessage: "Register not found",
        });
      }
    }

    const service = new TransactionCategorizationService();
    return await service.recategorizeUnlockedPlaidEntries({
      accountId: budget.accountId,
      accountRegisterId: body.accountRegisterId,
      userId: user.userId,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
