import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError, readBody, setResponseStatus } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { createSavingsGoalSchema, savingsGoalSchema } from "~/schema/zod";
import { ensureCategoryForAccount } from "~/server/lib/ensureCategoryForAccount";

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const body = await readBody(event);
    const parsed = createSavingsGoalSchema.parse(body);

    const [sourceRegister, targetRegister] = await Promise.all([
      PrismaDb.accountRegister.findFirst({
        where: { id: parsed.sourceAccountRegisterId, isArchived: false },
        include: {
          account: {
            select: {
              id: true,
              userAccounts: {
                where: { userId: user.userId },
                select: { userId: true },
              },
            },
          },
        },
      }),
      PrismaDb.accountRegister.findFirst({
        where: { id: parsed.targetAccountRegisterId, isArchived: false },
        include: {
          account: {
            select: {
              userAccounts: {
                where: { userId: user.userId },
                select: { userId: true },
              },
            },
          },
        },
      }),
    ]);

    if (
      !sourceRegister ||
      !sourceRegister.account.userAccounts.some((ua) => ua.userId === user.userId)
    ) {
      throw createError({
        statusCode: 404,
        statusMessage: "Source account register not found",
      });
    }
    if (
      !targetRegister ||
      !targetRegister.account.userAccounts.some((ua) => ua.userId === user.userId)
    ) {
      throw createError({
        statusCode: 404,
        statusMessage: "Target account register not found",
      });
    }
    if (sourceRegister.budgetId !== targetRegister.budgetId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Source and target must belong to the same budget",
      });
    }

    await ensureCategoryForAccount(
      PrismaDb,
      parsed.categoryId ?? null,
      sourceRegister.accountId,
    );

    const maxSort = await PrismaDb.savingsGoal.aggregate({
      where: { budgetId: sourceRegister.budgetId, isArchived: false },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const created = await PrismaDb.savingsGoal.create({
      data: {
        accountId: sourceRegister.accountId,
        budgetId: sourceRegister.budgetId,
        name: parsed.name,
        targetAmount: parsed.targetAmount,
        sourceAccountRegisterId: parsed.sourceAccountRegisterId,
        targetAccountRegisterId: parsed.targetAccountRegisterId,
        priorityOverDebt: parsed.priorityOverDebt ?? false,
        ignoreMinBalance: parsed.ignoreMinBalance ?? false,
        categoryId: parsed.categoryId ?? null,
        sortOrder,
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

    setResponseStatus(event, 201);
    return savingsGoalSchema.parse({
      ...created,
      targetAmount: Number(created.targetAmount),
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
