import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError, readBody, getRouterParam } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { updateSavingsGoalSchema, savingsGoalSchema } from "~/schema/zod";
import { ensureCategoryForAccount } from "~/server/lib/ensureCategoryForAccount";

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

    const existing = await PrismaDb.savingsGoal.findFirst({
      where: {
        id: goalId,
        account: {
          userAccounts: { some: { userId: user.userId } },
        },
      },
    });

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: "Savings goal not found",
      });
    }

    const body = await readBody(event);
    const data = updateSavingsGoalSchema.parse(body);

    if (
      data.sourceAccountRegisterId !== undefined ||
      data.targetAccountRegisterId !== undefined
    ) {
      const [sourceReg, targetReg] = await Promise.all([
        data.sourceAccountRegisterId !== undefined
          ? PrismaDb.accountRegister.findFirst({
              where: {
                id: data.sourceAccountRegisterId,
                isArchived: false,
                budgetId: existing.budgetId,
                account: {
                  userAccounts: { some: { userId: user.userId } },
                },
              },
            })
          : null,
        data.targetAccountRegisterId !== undefined
          ? PrismaDb.accountRegister.findFirst({
              where: {
                id: data.targetAccountRegisterId,
                isArchived: false,
                budgetId: existing.budgetId,
                account: {
                  userAccounts: { some: { userId: user.userId } },
                },
              },
            })
          : null,
      ]);
      if (
        data.sourceAccountRegisterId !== undefined &&
        !sourceReg
      ) {
        throw createError({
          statusCode: 400,
          statusMessage:
            "Source account register not found or not in this budget",
        });
      }
      if (
        data.targetAccountRegisterId !== undefined &&
        !targetReg
      ) {
        throw createError({
          statusCode: 400,
          statusMessage:
            "Target account register not found or not in this budget",
        });
      }
    }

    if (data.categoryId !== undefined) {
      await ensureCategoryForAccount(
        PrismaDb,
        data.categoryId,
        existing.accountId,
      );
    }

    const updated = await PrismaDb.savingsGoal.update({
      where: { id: goalId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.targetAmount !== undefined && { targetAmount: data.targetAmount }),
        ...(data.sourceAccountRegisterId !== undefined && {
          sourceAccountRegisterId: data.sourceAccountRegisterId,
        }),
        ...(data.targetAccountRegisterId !== undefined && {
          targetAccountRegisterId: data.targetAccountRegisterId,
        }),
        ...(data.priorityOverDebt !== undefined && {
          priorityOverDebt: data.priorityOverDebt,
        }),
        ...(data.ignoreMinBalance !== undefined && {
          ignoreMinBalance: data.ignoreMinBalance,
        }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
      },
      select: {
        id: true,
        accountId: true,
        budgetId: true,
        name: true,
        targetAmount: true,
        sourceAccountRegisterId: true,
        targetAccountRegisterId: true,
        priorityOverDebt: true,
        ignoreMinBalance: true,
        categoryId: true,
        sortOrder: true,
        isArchived: true,
      },
    });

    return savingsGoalSchema.parse({
      ...updated,
      targetAmount: Number(updated.targetAmount),
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
