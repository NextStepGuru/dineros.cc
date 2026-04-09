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

    await PrismaDb.accountRegister.findFirstOrThrow({
      where: {
        id,
        account: { userAccounts: { some: { userId } } },
      },
    });

    const rows = await PrismaDb.cryptoRegisterChain.findMany({
      where: { accountRegisterId: id },
      select: { evmChainId: true },
    });
    return { evmChainIds: rows.map((r) => r.evmChainId) };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
