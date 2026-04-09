import { createError } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const id = Number(getRouterParam(event, "id"));
    if (!Number.isFinite(id) || id < 1) {
      throw createError({ statusCode: 400, message: "Invalid register id." });
    }

    const reg = await PrismaDb.accountRegister.findFirst({
      where: {
        id,
        account: { userAccounts: { some: { userId } } },
      },
      include: { type: true },
    });
    if (!reg) {
      throw createError({ statusCode: 404, message: "Register not found." });
    }
    if (reg.type.registerClass !== "crypto") {
      throw createError({
        statusCode: 400,
        message: "Not a crypto wallet register.",
      });
    }

    const tokensRaw = await PrismaDb.cryptoTokenBalance.findMany({
      where: { accountRegisterId: id },
    });
    const tokens = [...tokensRaw].sort(
      (a, b) =>
        Number(b.valueUsd ?? 0) - Number(a.valueUsd ?? 0) || a.id - b.id,
    );

    return {
      accountRegisterId: id,
      alchemyLastSyncAt: reg.alchemyLastSyncAt,
      totalUsd: Number(reg.latestBalance),
      tokens: tokens.map((t) => ({
        id: t.id,
        accountRegisterId: t.accountRegisterId,
        network: t.network,
        tokenAddress: t.tokenAddress,
        tokenName: t.tokenName,
        tokenSymbol: t.tokenSymbol,
        tokenDecimals: t.tokenDecimals,
        displayBalance: Number(t.displayBalance),
        priceUsd: t.priceUsd != null ? Number(t.priceUsd) : null,
        valueUsd: t.valueUsd != null ? Number(t.valueUsd) : null,
        logoUrl: t.logoUrl,
        syncedAt: t.syncedAt.toISOString(),
      })),
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
