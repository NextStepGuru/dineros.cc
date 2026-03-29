import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError, getRouterParam } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { accountWhereUserIsMember } from "~/server/lib/accountAccess";
import { assertBudgetVisibleToUser } from "~/server/lib/accountMembership";
import { cloneBudget } from "~/server/services/budgetCloneService";
import { addRecalculateJob } from "~/server/clients/queuesClient";

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const id = getRouterParam(event, "id");
    const budgetId = id ? Number.parseInt(id, 10) : Number.NaN;
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
        statusMessage: "Cannot reset the default budget",
      });
    }

    const defaultBudget = await PrismaDb.budget.findFirst({
      where: {
        accountId: budget.accountId,
        isDefault: true,
        account: accountWhereUserIsMember(user.userId),
      },
      select: { id: true, accountId: true },
    });
    if (!defaultBudget) {
      throw createError({
        statusCode: 400,
        statusMessage: "Default budget not found",
      });
    }

    await PrismaDb.$transaction(
      async (tx) => {
        const registerIds = await tx.accountRegister
          .findMany({
            where: { budgetId },
            select: { id: true },
          })
          .then((rows) => rows.map((r) => r.id));

        if (registerIds.length > 0) {
          const reoccurrenceIds = await tx.reoccurrence
            .findMany({
              where: { accountRegisterId: { in: registerIds } },
              select: { id: true },
            })
            .then((rows) => rows.map((r) => r.id));

          await tx.reoccurrencePlaidNameAlias.deleteMany({
            where: { reoccurrenceId: { in: reoccurrenceIds } },
          });
          await tx.reoccurrenceSplit.deleteMany({
            where: { reoccurrenceId: { in: reoccurrenceIds } },
          });
          await tx.reoccurrenceSkip.deleteMany({
            where: { reoccurrenceId: { in: reoccurrenceIds } },
          });
          await tx.registerEntry.deleteMany({
            where: { accountRegisterId: { in: registerIds } },
          });
          await tx.reoccurrence.deleteMany({
            where: { accountRegisterId: { in: registerIds } },
          });
          await tx.accountRegister.deleteMany({
            where: { budgetId },
          });
        }

        await cloneBudget(
          tx as Parameters<typeof cloneBudget>[0],
          defaultBudget.id,
          budgetId,
          budget.accountId,
        );
      },
      { maxWait: 20000, timeout: 60000 },
    );

    addRecalculateJob({ accountId: budget.accountId });

    return { message: "Budget reset from default." };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
