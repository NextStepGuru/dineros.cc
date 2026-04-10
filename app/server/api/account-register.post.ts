import type { Prisma } from "@prisma/client";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { createError } from "h3";
import type { z } from "zod";
import { accountRegisterSchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { addRecalculateJob } from "../clients/queuesClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast";
import { parseEvmWalletAddress } from "~/server/lib/evmAddress";
import { syncWalletPortfolio } from "~/server/services/AlchemyService";
import { log } from "~/server/logger";

type AccountRegisterParsed = z.infer<typeof accountRegisterSchema>;

function vehicleDetailsForPrisma(
  vehicleDetails: AccountRegisterParsed["vehicleDetails"],
): Prisma.InputJsonValue | undefined {
  if (vehicleDetails == null) {
    return undefined;
  }
  return vehicleDetails as Prisma.InputJsonValue;
}

async function resolveCryptoWalletAndChains(args: {
  isCryptoType: boolean;
  walletAddressRaw: AccountRegisterParsed["walletAddress"];
  selectedChainIds: AccountRegisterParsed["selectedChainIds"];
}): Promise<{ normalizedWallet: string | null; chainIdsToLink: number[] }> {
  const { isCryptoType, walletAddressRaw, selectedChainIds } = args;
  if (!isCryptoType) {
    return { normalizedWallet: null, chainIdsToLink: [] };
  }
  if (!walletAddressRaw || typeof walletAddressRaw !== "string") {
    throw createError({
      statusCode: 400,
      message: "Wallet address is required for crypto accounts.",
    });
  }
  let normalizedWallet: string;
  try {
    normalizedWallet = parseEvmWalletAddress(walletAddressRaw);
  } catch {
    throw createError({
      statusCode: 400,
      message: "Invalid EVM wallet address.",
    });
  }
  let chainIdsToLink = selectedChainIds ?? [];
  if (chainIdsToLink.length === 0) {
    const defaultChain = await PrismaDb.evmChain.findFirst({
      where: { isDefault: true },
      orderBy: { id: "asc" },
    });
    if (defaultChain) {
      chainIdsToLink = [defaultChain.id];
    }
  }
  if (chainIdsToLink.length === 0) {
    throw createError({
      statusCode: 400,
      message: "Select at least one EVM chain.",
    });
  }
  const count = await PrismaDb.evmChain.count({
    where: { id: { in: chainIdsToLink } },
  });
  if (count !== chainIdsToLink.length) {
    throw createError({
      statusCode: 400,
      message: "One or more EVM chains are invalid.",
    });
  }
  return { normalizedWallet, chainIdsToLink };
}

async function assertAccountRegisterUpsertAccess(args: {
  userId: number;
  accountId: string;
  registerId: number;
}): Promise<void> {
  const { userId, accountId, registerId } = args;
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
  if (registerId > 0) {
    await PrismaDb.accountRegister.findFirstOrThrow({
      where: {
        id: registerId,
        accountId,
        account: {
          userAccounts: {
            some: { userId },
          },
        },
      },
    });
  }
}

function buildAccountRegisterUpsertCreate(
  parsed: AccountRegisterParsed,
  options: {
    isCryptoType: boolean;
    normalizedWallet: string | null;
    paymentCategoryIdResolved: string | null;
    interestCategoryIdResolved: string | null;
    collateralAssetRegisterId: number | null;
    targetAccountRegisterId: number | null;
  },
) {
  const {
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
    vehicleDetails,
  } = parsed;
  const {
    isCryptoType,
    normalizedWallet,
    paymentCategoryIdResolved,
    interestCategoryIdResolved,
    collateralAssetRegisterId,
    targetAccountRegisterId,
  } = options;

  return {
    accountId,
    typeId,
    budgetId,
    name,
    balance: isCryptoType ? 0 : balance,
    latestBalance: isCryptoType ? 0 : (balance ?? latestBalance),
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
    vehicleDetails: vehicleDetailsForPrisma(vehicleDetails),
    walletAddress: isCryptoType ? normalizedWallet : null,
    alchemyJson: isCryptoType ? undefined : null,
    alchemyLastSyncAt: null,
  };
}

function buildAccountRegisterUpsertUpdate(
  parsed: AccountRegisterParsed,
  options: {
    isCryptoType: boolean;
    normalizedWallet: string | null;
    paymentCategoryIdResolved: string | null;
    interestCategoryIdResolved: string | null;
    collateralAssetRegisterId: number | null;
    targetAccountRegisterId: number | null;
  },
) {
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
    vehicleDetails,
  } = parsed;
  const {
    isCryptoType,
    normalizedWallet,
    paymentCategoryIdResolved,
    interestCategoryIdResolved,
    collateralAssetRegisterId,
    targetAccountRegisterId,
  } = options;

  return {
    id,
    accountId,
    typeId,
    budgetId,
    name,
    balance: isCryptoType ? undefined : balance,
    latestBalance: isCryptoType ? undefined : (balance ?? latestBalance),
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
    vehicleDetails: vehicleDetailsForPrisma(vehicleDetails),
    walletAddress: isCryptoType ? normalizedWallet : null,
    alchemyJson: isCryptoType ? undefined : null,
    alchemyLastSyncAt: isCryptoType ? undefined : null,
  };
}

async function syncOrClearCryptoAfterUpsert(args: {
  isCryptoType: boolean;
  accountRegisterId: number;
  chainIdsToLink: number[];
}): Promise<void> {
  const { isCryptoType, accountRegisterId, chainIdsToLink } = args;
  if (isCryptoType) {
    await PrismaDb.cryptoRegisterChain.deleteMany({
      where: { accountRegisterId },
    });
    await PrismaDb.cryptoRegisterChain.createMany({
      data: chainIdsToLink.map((evmChainId) => ({
        accountRegisterId,
        evmChainId,
      })),
    });
    const syncResult = await syncWalletPortfolio(accountRegisterId);
    if (!syncResult.ok) {
      log({
        message: "Crypto wallet sync failed after save",
        level: "warn",
        data: { accountRegisterId, syncResult },
      });
    }
    return;
  }
  await PrismaDb.cryptoRegisterChain.deleteMany({
    where: { accountRegisterId },
  });
  await PrismaDb.cryptoTokenBalance.deleteMany({
    where: { accountRegisterId },
  });
}

async function createInitialRegisterEntryIfNew(args: {
  isNewRegister: boolean;
  isCryptoType: boolean;
  accountRegister: {
    id: number;
    balance: Prisma.Decimal | number | null;
    statementAt: Date | null;
  };
}): Promise<void> {
  const { isNewRegister, isCryptoType, accountRegister } = args;
  if (!isNewRegister || isCryptoType || !accountRegister.id) {
    return;
  }
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

    let { collateralAssetRegisterId, targetAccountRegisterId } = parsed;
    collateralAssetRegisterId = normalizeOptionalPositiveId(
      collateralAssetRegisterId,
    );
    targetAccountRegisterId = normalizeOptionalPositiveId(
      targetAccountRegisterId,
    );

    const accountType = await PrismaDb.accountType.findUnique({
      where: { id: parsed.typeId },
    });
    const isCryptoType = accountType?.registerClass === "crypto";
    const isCreditType = accountType?.isCredit === true;

    const { normalizedWallet, chainIdsToLink } =
      await resolveCryptoWalletAndChains({
        isCryptoType,
        walletAddressRaw: parsed.walletAddress,
        selectedChainIds: parsed.selectedChainIds,
      });

    if (!isCreditType) {
      collateralAssetRegisterId = null;
      targetAccountRegisterId = null;
    }

    let paymentCategoryIdResolved = parsed.paymentCategoryId ?? null;
    const interestCategoryIdResolved = parsed.interestCategoryId ?? null;
    if (!isCreditType) {
      paymentCategoryIdResolved = null;
    }

    await assertCategoriesExistForAccount(parsed.accountId, [
      paymentCategoryIdResolved,
      interestCategoryIdResolved,
    ]);

    await validateCreditTypeRelations({
      userId,
      accountId: parsed.accountId,
      registerId: parsed.id,
      isCreditType,
      targetAccountRegisterId,
      collateralAssetRegisterId,
    });

    await assertAccountRegisterUpsertAccess({
      userId,
      accountId: parsed.accountId,
      registerId: parsed.id,
    });

    const relationOptions = {
      isCryptoType,
      normalizedWallet,
      paymentCategoryIdResolved,
      interestCategoryIdResolved,
      collateralAssetRegisterId,
      targetAccountRegisterId,
    };

    const accountRegister = await PrismaDb.accountRegister.upsert({
      create: buildAccountRegisterUpsertCreate(parsed, relationOptions),
      update: buildAccountRegisterUpsertUpdate(parsed, relationOptions),
      where: {
        id: parsed.id,
      },
    });

    if (accountRegister?.id) {
      await syncOrClearCryptoAfterUpsert({
        isCryptoType,
        accountRegisterId: accountRegister.id,
        chainIdsToLink,
      });
    }

    addRecalculateJob({ accountId: parsed.accountId });

    await createInitialRegisterEntryIfNew({
      isNewRegister: !parsed.id,
      isCryptoType,
      accountRegister,
    });

    const refreshed = await PrismaDb.accountRegister.findUnique({
      where: { id: accountRegister.id },
    });
    return accountRegisterSchema.parse(refreshed ?? accountRegister);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
