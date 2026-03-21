import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { createError } from "h3";
import { accountRegisterSchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { addRecalculateJob } from "../clients/queuesClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const { userId } = getUser(event);

    const parsed = accountRegisterSchema.parse(body);
    let {
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
      collateralAssetRegisterId,
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
      depreciationRate,
      depreciationMethod,
      assetOriginalValue,
      assetResidualValue,
      assetUsefulLifeYears,
      assetStartAt,
      paymentCategoryId,
      interestCategoryId,
    } = parsed;

    if (
      collateralAssetRegisterId == null ||
      !Number.isFinite(collateralAssetRegisterId) ||
      collateralAssetRegisterId <= 0
    ) {
      collateralAssetRegisterId = null;
    }

    if (
      targetAccountRegisterId == null ||
      !Number.isFinite(targetAccountRegisterId) ||
      targetAccountRegisterId <= 0
    ) {
      targetAccountRegisterId = null;
    }

    const accountType = await PrismaDb.accountType.findUnique({
      where: { id: typeId },
    });
    const isCreditType = accountType?.isCredit === true;
    if (!isCreditType) {
      collateralAssetRegisterId = null;
      targetAccountRegisterId = null;
    }

    let paymentCategoryIdResolved = paymentCategoryId ?? null;
    let interestCategoryIdResolved = interestCategoryId ?? null;
    if (!isCreditType) {
      paymentCategoryIdResolved = null;
    }

    for (const cid of [paymentCategoryIdResolved, interestCategoryIdResolved]) {
      if (cid == null) continue;
      const cat = await PrismaDb.category.findFirst({
        where: { id: cid, accountId, isArchived: false },
      });
      if (!cat) {
        throw createError({
          statusCode: 400,
          message: "Category not found for this account.",
        });
      }
    }

    if (isCreditType) {
      if (targetAccountRegisterId != null) {
        const payer = await PrismaDb.accountRegister.findFirst({
          where: {
            id: targetAccountRegisterId,
            accountId,
            isArchived: false,
            account: {
              userAccounts: { some: { userId } },
            },
          },
          include: { type: true },
        });
        if (!payer) {
          throw createError({
            statusCode: 400,
            message: "Payment source account not found or not accessible.",
          });
        }
        if (payer.type.isCredit) {
          throw createError({
            statusCode: 400,
            message: "Payment source must be a non-credit (asset) account.",
          });
        }
        if (payer.subAccountRegisterId != null) {
          throw createError({
            statusCode: 400,
            message: "Payment source must be a top-level account, not a pocket.",
          });
        }
        if (id > 0 && targetAccountRegisterId === id) {
          throw createError({
            statusCode: 400,
            message: "Cannot use this loan or card as its own payment source.",
          });
        }
      }
      if (collateralAssetRegisterId != null) {
        const asset = await PrismaDb.accountRegister.findFirst({
          where: {
            id: collateralAssetRegisterId,
            accountId,
            isArchived: false,
            account: {
              userAccounts: { some: { userId } },
            },
          },
          include: { type: true },
        });
        if (!asset) {
          throw createError({
            statusCode: 400,
            message: "Linked asset not found or not accessible.",
          });
        }
        if (asset.type.isCredit) {
          throw createError({
            statusCode: 400,
            message: "Linked collateral must be a non-credit (asset) account.",
          });
        }
        if (asset.subAccountRegisterId != null) {
          throw createError({
            statusCode: 400,
            message: "Linked asset must be a top-level account, not a pocket.",
          });
        }
        if (id > 0 && collateralAssetRegisterId === id) {
          throw createError({
            statusCode: 400,
            message: "Cannot link an account to itself as collateral.",
          });
        }
        const otherLoan = await PrismaDb.accountRegister.findFirst({
          where: {
            collateralAssetRegisterId,
            ...(id > 0 ? { id: { not: id } } : {}),
          },
        });
        if (otherLoan) {
          throw createError({
            statusCode: 400,
            message:
              "That asset is already linked to another loan. Only one loan per asset.",
          });
        }
      }
    }

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
        latestBalance: balance ?? latestBalance,
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
        collateralAssetRegisterId,
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
        depreciationRate,
        depreciationMethod,
        assetOriginalValue,
        assetResidualValue,
        assetUsefulLifeYears,
        assetStartAt,
        paymentCategoryId: paymentCategoryIdResolved,
        interestCategoryId: interestCategoryIdResolved,
      },
      update: {
        id,
        accountId,
        typeId,
        budgetId,
        name,
        balance,
        latestBalance: balance ?? latestBalance,
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
        collateralAssetRegisterId,
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
        depreciationRate,
        depreciationMethod,
        assetOriginalValue,
        assetResidualValue,
        assetUsefulLifeYears,
        assetStartAt,
        paymentCategoryId: paymentCategoryIdResolved,
        interestCategoryId: interestCategoryIdResolved,
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
          createdAt: accountRegister.statementAt
            ? dateTimeService.toDate(accountRegister.statementAt)
            : dateTimeService.nowDate(),
        },
      });
    }

    return accountRegisterSchema.parse(accountRegister);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
