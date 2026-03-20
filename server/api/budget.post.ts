import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError, readBody, setResponseStatus } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { createBudgetSchema, budgetSchema } from "~/schema/zod";
import { cloneBudget } from "~/server/services/budgetCloneService";

const MAX_BUDGETS = 10;

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const body = await readBody(event);
    const { name } = createBudgetSchema.parse(body);

    const defaultBudget = await PrismaDb.budget.findFirst({
      where: { userId: user.userId, isDefault: true },
    });
    if (!defaultBudget) {
      throw createError({
        statusCode: 400,
        statusMessage: "Default budget not found",
      });
    }

    const count = await PrismaDb.budget.count({
      where: { userId: user.userId, isArchived: false },
    });
    if (count >= MAX_BUDGETS) {
      throw createError({
        statusCode: 400,
        statusMessage: "Maximum budgets (10) reached.",
      });
    }

    const result = await PrismaDb.$transaction(async (tx) => {
      const newBudget = await tx.budget.create({
        data: {
          name,
          accountId: defaultBudget.accountId,
          userId: user.userId,
          isDefault: false,
        },
        select: {
          id: true,
          name: true,
          accountId: true,
          isArchived: true,
          isDefault: true,
          userId: true,
        },
      });
      await cloneBudget(
        tx as Parameters<typeof cloneBudget>[0],
        defaultBudget.id,
        newBudget.id,
        defaultBudget.accountId,
      );
      return newBudget;
    });

    setResponseStatus(event, 201);
    return budgetSchema.parse(result);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
