import { createError } from "h3";
import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { syncWalletPortfolio } from "~/server/services/AlchemyService";

const bodySchema = z.object({
  accountRegisterId: z.number().int().positive(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = bodySchema.parse(await readBody(event));

    const reg = await PrismaDb.accountRegister.findFirst({
      where: {
        id: body.accountRegisterId,
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

    const result = await syncWalletPortfolio(body.accountRegisterId);
    if (!result.ok) {
      throw createError({ statusCode: 502, message: result.message });
    }

    const updated = await PrismaDb.accountRegister.findUnique({
      where: { id: body.accountRegisterId },
    });
    return { ok: true, accountRegister: updated };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
