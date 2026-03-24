import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError, getRouterParam } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { addRecalculateJob } from "~/server/clients/queuesClient";

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const id = getRouterParam(event, "id");
    const goalId = id ? parseInt(id, 10) : NaN;
    if (!Number.isInteger(goalId) || goalId < 1) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid savings goal id",
      });
    }

    const goal = await PrismaDb.savingsGoal.findFirst({
      where: {
        id: goalId,
        account: {
          userAccounts: { some: { userId: user.userId } },
        },
      },
      select: { id: true, accountId: true },
    });

    if (!goal) {
      throw createError({
        statusCode: 404,
        statusMessage: "Savings goal not found",
      });
    }

    await PrismaDb.savingsGoal.update({
      where: { id: goalId },
      data: { isArchived: true },
    });

    addRecalculateJob({ accountId: goal.accountId });

    return { message: "Savings goal archived." };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
