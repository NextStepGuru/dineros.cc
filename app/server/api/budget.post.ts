import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError, readBody, setResponseStatus } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { createBudgetSchema, budgetSchema } from "~/schema/zod";
import { cloneBudget } from "~/server/services/budgetCloneService";
import { duplicateAccountWorkspace } from "~/server/services/accountWorkspaceCloneService";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { accountWhereUserIsMember } from "~/server/lib/accountAccess";

const MAX_BUDGETS = 10;

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const body = await readBody(event);
    const { name, duplicateFinancialAccount, sourceBudgetId } =
      createBudgetSchema.parse(body);

    const count = await PrismaDb.budget.count({
      where: { userId: user.userId, isArchived: false },
    });
    if (count >= MAX_BUDGETS) {
      throw createError({
        statusCode: 400,
        statusMessage: "Maximum budgets (10) reached.",
      });
    }

    if (duplicateFinancialAccount) {
      const result = await PrismaDb.$transaction(
        async (tx) => {
          return duplicateAccountWorkspace(
            tx as Parameters<typeof duplicateAccountWorkspace>[0],
            {
              userId: user.userId,
              name,
              sourceBudgetId,
            },
          );
        },
        { maxWait: 20000, timeout: 120000 },
      );

      addRecalculateJob({ accountId: result.accountId });

      const newBudget = await PrismaDb.budget.findFirstOrThrow({
        where: { id: result.budgetId },
        select: {
          id: true,
          name: true,
          accountId: true,
          isArchived: true,
          isDefault: true,
          userId: true,
        },
      });

      setResponseStatus(event, 201);
      return budgetSchema.parse(newBudget);
    }

    const defaultBudget = await PrismaDb.budget.findFirst({
      where: {
        isDefault: true,
        account: accountWhereUserIsMember(user.userId),
      },
    });
    if (!defaultBudget) {
      throw createError({
        statusCode: 400,
        statusMessage: "Default budget not found",
      });
    }

    const result = await PrismaDb.$transaction(
      async (tx) => {
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
      },
      { maxWait: 20000, timeout: 60000 },
    );

    setResponseStatus(event, 201);
    return budgetSchema.parse(result);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
