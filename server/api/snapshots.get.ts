import { z } from "zod";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { assertUserOwnsAccount } from "~/server/services/accountSnapshotService";

const querySchema = z.object({
  accountId: z.string().uuid(),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const { accountId } = querySchema.parse(getQuery(event));
    await assertUserOwnsAccount(user.userId, accountId);

    const rows = await PrismaDb.accountSnapshot.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    });

    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
