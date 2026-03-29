import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError, getRouterParam } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { assertBudgetVisibleToUser } from "~/server/lib/accountMembership";
import { addRecalculateJob } from "~/server/clients/queuesClient";

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
        statusMessage: "Cannot delete the default budget",
      });
    }

    await PrismaDb.$transaction(async (tx) => {
      await tx.accountRegister.updateMany({
        where: { budgetId },
        data: { isArchived: true },
      });
      await tx.budget.update({
        where: { id: budgetId },
        data: { isArchived: true },
      });
    });

    addRecalculateJob({ accountId: budget.accountId });

    return { message: "Budget archived." };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
