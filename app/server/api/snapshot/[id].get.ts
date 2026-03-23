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
      include: {
        registers: {
          orderBy: [{ accountRegisterId: "asc" }],
        },
      },
    });

    if (!snapshot) {
      throw createError({ statusCode: 404, statusMessage: "Snapshot not found" });
    }

    return {
      id: snapshot.id,
      accountId: snapshot.accountId,
      createdAt: snapshot.createdAt.toISOString(),
      registers: snapshot.registers.map((r) => ({
        registerSnapshotId: r.id,
        accountRegisterId: r.accountRegisterId,
        subAccountRegisterId: r.subAccountRegisterId,
        collateralAssetRegisterId: r.collateralAssetRegisterId,
        name: r.name,
        balance: Number(r.balance),
        latestBalance: Number(r.latestBalance),
        typeId: r.typeId,
      })),
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
