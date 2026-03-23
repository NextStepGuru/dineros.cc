import { createError } from "h3";
import { z } from "zod";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const { id } = paramsSchema.parse(event.context.params ?? {});

    const snapshot = await PrismaDb.accountSnapshot.findFirst({
      where: {
        id,
        account: {
          userAccounts: {
            some: { userId: user.userId },
          },
        },
      },
    });

    if (!snapshot) {
      throw createError({ statusCode: 404, statusMessage: "Snapshot not found" });
    }

    await PrismaDb.accountSnapshot.delete({
      where: { id },
    });

    return { ok: true };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
