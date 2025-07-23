import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { accountRegisterSchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { addRecalculateJob } from "../clients/queuesClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const { userId } = getUser(event);

    const {
      id,
      accountId,
      typeId,
      budgetId,
      name,
      balance,
      latestBalance,
      minPayment,
      statementAt,
      statementIntervalId,
      apr1,
      apr1StartAt,
      apr2,
      apr2StartAt,
      apr3,
      apr3StartAt,
      targetAccountRegisterId,
      loanStartAt,
      loanPaymentsPerYear,
      loanTotalYears,
      loanOriginalAmount,
      sortOrder,
      savingsGoalSortOrder,
      accountSavingsGoal,
      minAccountBalance,
      allowExtraPayment,
      isArchived,
      subAccountRegisterId,
    } = accountRegisterSchema.parse(body);

    // Can user create or update this account register?
    await PrismaDb.account.findFirstOrThrow({
      where: {
        id: accountId,
        userAccounts: {
          some: {
            userId,
          },
        },
      },
    });

    const accountRegister = await PrismaDb.accountRegister.upsert({
      create: {
        accountId,
        typeId,
        budgetId,
        name,
        balance,
        latestBalance,
        minPayment,
        statementAt: statementAt || dateTimeService.nowDate(),
        statementIntervalId,
        apr1,
        apr1StartAt,
        apr2,
        apr2StartAt,
        apr3,
        apr3StartAt,
        targetAccountRegisterId,
        loanStartAt,
        loanPaymentsPerYear,
        loanTotalYears,
        loanOriginalAmount,
        sortOrder: sortOrder ? sortOrder : undefined,
        savingsGoalSortOrder,
        accountSavingsGoal,
        minAccountBalance,
        allowExtraPayment,
        isArchived,
        subAccountRegisterId,
      },
      update: {
        id,
        accountId,
        typeId,
        budgetId,
        name,
        balance,
        latestBalance,
        minPayment,
        statementAt: statementAt || dateTimeService.nowDate(),
        statementIntervalId,
        apr1,
        apr1StartAt,
        apr2,
        apr2StartAt,
        apr3,
        apr3StartAt,
        targetAccountRegisterId,
        loanStartAt,
        loanPaymentsPerYear,
        loanTotalYears,
        loanOriginalAmount,
        sortOrder,
        savingsGoalSortOrder,
        accountSavingsGoal,
        minAccountBalance,
        allowExtraPayment,
        isArchived,
        subAccountRegisterId,
      },
      where: {
        id,
      },
    });

    addRecalculateJob({ accountId });

    // If this is a newly created account register, create a default register entry with isBalanceEntry=true
    if (!id && accountRegister && accountRegister.id) {
      // Create a default register entry for the new account register
      await PrismaDb.registerEntry.create({
        data: {
          accountRegisterId: accountRegister.id,
          amount: accountRegister.balance ?? 0,
          balance: accountRegister.balance ?? 0,
          isBalanceEntry: true,
          description: "Initial Balance",
          createdAt: accountRegister.statementAt || new Date(),
        },
      });
    }

    return accountRegisterSchema.parse(accountRegister);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
