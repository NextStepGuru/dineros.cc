import type { Prisma } from "@prisma/client";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { createError } from "h3";
import { accountRegisterSchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { addRecalculateJob } from "../clients/queuesClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast";
import { parseEvmWalletAddress } from "~/server/lib/evmAddress";
import { syncWalletPortfolio } from "~/server/services/AlchemyService";
import { log } from "~/server/logger";

function normalizeOptionalPositiveId(
  value: number | null | undefined,
): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

async function assertCategoriesExistForAccount(
  accountId: string,
  categoryIds: (string | null)[],
): Promise<void> {
  for (const cid of categoryIds) {
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
}

async function validatePayerAccountRegister(args: {
  userId: number;
  accountId: string;
  registerId: number;
  targetAccountRegisterId: number;
}): Promise<void> {
  const { userId, accountId, registerId, targetAccountRegisterId } = args;
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
  if (registerId > 0 && targetAccountRegisterId === registerId) {
    throw createError({
      statusCode: 400,
      message: "Cannot use this loan or card as its own payment source.",
    });
  }
}

async function validateCollateralAssetRegister(args: {
  userId: number;
  accountId: string;
  registerId: number;
  collateralAssetRegisterId: number;
}): Promise<void> {
  const { userId, accountId, registerId, collateralAssetRegisterId } = args;
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
  if (registerId > 0 && collateralAssetRegisterId === registerId) {
    throw createError({
      statusCode: 400,
      message: "Cannot link an account to itself as collateral.",
    });
  }
  const otherLoan = await PrismaDb.accountRegister.findFirst({
    where: {
      collateralAssetRegisterId,
      ...(registerId > 0 ? { id: { not: registerId } } : {}),
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

async function validateCreditTypeRelations(args: {
  userId: number;
  accountId: string;
  registerId: number;
  isCreditType: boolean;
  targetAccountRegisterId: number | null;
  collateralAssetRegisterId: number | null;
}): Promise<void> {
  const {
    userId,
    accountId,
    registerId,
    isCreditType,
    targetAccountRegisterId,
    collateralAssetRegisterId,
  } = args;
  if (!isCreditType) return;

  if (targetAccountRegisterId != null) {
    await validatePayerAccountRegister({
      userId,
      accountId,
      registerId,
      targetAccountRegisterId,
    });
  }
  if (collateralAssetRegisterId != null) {
    await validateCollateralAssetRegister({
      userId,
      accountId,
      registerId,
      collateralAssetRegisterId,
    });
  }
}

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const { userId } = getUser(event);

    const parsed = accountRegisterSchema.parse(body);
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
      vehicleDetails,
      walletAddress: walletAddressRaw,
      selectedChainIds,
    } = parsed;

    let { collateralAssetRegisterId, targetAccountRegisterId } = parsed;
    collateralAssetRegisterId = normalizeOptionalPositiveId(
      collateralAssetRegisterId,
    );
    targetAccountRegisterId = normalizeOptionalPositiveId(
      targetAccountRegisterId,
    );

    const accountType = await PrismaDb.accountType.findUnique({
      where: { id: typeId },
    });
    const isCryptoType = accountType?.registerClass === "crypto";
    const isCreditType = accountType?.isCredit === true;

    let normalizedWallet: string | null = null;
    if (isCryptoType) {
      if (!walletAddressRaw || typeof walletAddressRaw !== "string") {
        throw createError({
          statusCode: 400,
          message: "Wallet address is required for crypto accounts.",
        });
      }
      try {
        normalizedWallet = parseEvmWalletAddress(walletAddressRaw);
      } catch {
        throw createError({
          statusCode: 400,
          message: "Invalid EVM wallet address.",
        });
      }
    }

    let chainIdsToLink = selectedChainIds ?? [];
    if (isCryptoType && chainIdsToLink.length === 0) {
      const defaultChain = await PrismaDb.evmChain.findFirst({
        where: { isDefault: true },
        orderBy: { id: "asc" },
      });
      if (defaultChain) {
        chainIdsToLink = [defaultChain.id];
      }
    }
    if (isCryptoType && chainIdsToLink.length === 0) {
      throw createError({
        statusCode: 400,
        message: "Select at least one EVM chain.",
      });
    }
    if (isCryptoType) {
      const count = await PrismaDb.evmChain.count({
        where: { id: { in: chainIdsToLink } },
      });
      if (count !== chainIdsToLink.length) {
        throw createError({
          statusCode: 400,
          message: "One or more EVM chains are invalid.",
        });
      }
    }
    if (!isCreditType) {
      collateralAssetRegisterId = null;
      targetAccountRegisterId = null;
    }

    let paymentCategoryIdResolved = paymentCategoryId ?? null;
    const interestCategoryIdResolved = interestCategoryId ?? null;
    if (!isCreditType) {
      paymentCategoryIdResolved = null;
    }

    await assertCategoriesExistForAccount(accountId, [
      paymentCategoryIdResolved,
      interestCategoryIdResolved,
    ]);

    await validateCreditTypeRelations({
      userId,
      accountId,
      registerId: id,
      isCreditType,
      targetAccountRegisterId,
      collateralAssetRegisterId,
    });

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

    if (id > 0) {
      await PrismaDb.accountRegister.findFirstOrThrow({
        where: {
          id,
          accountId,
          account: {
            userAccounts: {
              some: { userId },
            },
          },
        },
      });
    }

    const accountRegister = await PrismaDb.accountRegister.upsert({
      create: {
        accountId,
        typeId,
        budgetId,
        name,
        balance: isCryptoType ? 0 : balance,
        latestBalance: isCryptoType ? 0 : balance ?? latestBalance,
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
        sortOrder: sortOrder || undefined,
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
        vehicleDetails:
          vehicleDetails === null || vehicleDetails === undefined
            ? undefined
            : (vehicleDetails as Prisma.InputJsonValue),
        walletAddress: isCryptoType ? normalizedWallet : null,
        alchemyJson: isCryptoType ? undefined : null,
        alchemyLastSyncAt: isCryptoType ? null : null,
      },
      update: {
        id,
        accountId,
        typeId,
        budgetId,
        name,
        balance: isCryptoType ? undefined : balance,
        latestBalance: isCryptoType ? undefined : balance ?? latestBalance,
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
        vehicleDetails:
          vehicleDetails === null || vehicleDetails === undefined
            ? undefined
            : (vehicleDetails as Prisma.InputJsonValue),
        walletAddress: isCryptoType ? normalizedWallet : null,
        alchemyJson: isCryptoType ? undefined : null,
        alchemyLastSyncAt: isCryptoType ? undefined : null,
      },
      where: {
        id,
      },
    });

    if (isCryptoType && accountRegister?.id) {
      await PrismaDb.cryptoRegisterChain.deleteMany({
        where: { accountRegisterId: accountRegister.id },
      });
      await PrismaDb.cryptoRegisterChain.createMany({
        data: chainIdsToLink.map((evmChainId) => ({
          accountRegisterId: accountRegister.id,
          evmChainId,
        })),
      });
      const syncResult = await syncWalletPortfolio(accountRegister.id);
      if (!syncResult.ok) {
        log({
          message: "Crypto wallet sync failed after save",
          level: "warn",
          data: { accountRegisterId: accountRegister.id, syncResult },
        });
      }
    } else if (accountRegister?.id) {
      await PrismaDb.cryptoRegisterChain.deleteMany({
        where: { accountRegisterId: accountRegister.id },
      });
      await PrismaDb.cryptoTokenBalance.deleteMany({
        where: { accountRegisterId: accountRegister.id },
      });
    }

    addRecalculateJob({ accountId });

    // If this is a newly created account register, create a default register entry with isBalanceEntry=true
    if (!id && accountRegister?.id && !isCryptoType) {
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

    const refreshed = await PrismaDb.accountRegister.findUnique({
      where: { id: accountRegister.id },
    });
    return accountRegisterSchema.parse(refreshed ?? accountRegister);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
