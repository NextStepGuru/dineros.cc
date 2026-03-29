import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError, readBody, getRouterParam } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { assertBudgetVisibleToUser } from "~/server/lib/accountMembership";
import { renameBudgetSchema, budgetSchema } from "~/schema/zod";

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const id = getRouterParam(event, "id");
    const budgetId = id ? parseInt(id, 10) : NaN;
    if (!Number.isInteger(budgetId) || budgetId < 1) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid budget id",
      });
    }

    const budget = await assertBudgetVisibleToUser(user.userId, budgetId);
    if (budget.isDefault) {
      throw createError({
        statusCode: 400,
        statusMessage: "Cannot rename the default budget",
      });
    }

    const body = await readBody(event);
    const { name } = renameBudgetSchema.parse(body);

    const updated = await PrismaDb.budget.update({
      where: { id: budgetId },
      data: { name },
      select: {
        id: true,
        name: true,
        accountId: true,
        isArchived: true,
        isDefault: true,
        userId: true,
      },
    });

    return budgetSchema.parse(updated);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
