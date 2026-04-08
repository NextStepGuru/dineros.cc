import { z } from "zod";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { reoccurrenceWithSplitsSchema } from "~/schema/zod";
import type { H3Event } from "h3";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { addRecalculateJob } from "~/server/clients/queuesClient";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const query = getQuery(event);
    const user = getUser(event);
    const deleteReoccurrenceSchema = z.object({
      reoccurrenceId: z.coerce.number().min(1),
    });

    const { reoccurrenceId } = deleteReoccurrenceSchema.parse(query);

    // Can the user delete this reoccurrence?
    const lookup = await PrismaDb.reoccurrence.findFirstOrThrow({
      where: {
        id: reoccurrenceId,
        register: {
          account: {
            userAccounts: {
              some: {
                userId: user.userId,
              },
            },
          },
        },
      },
    });

    const deletedData = await PrismaDb.$transaction(
      async (prisma) => {
        await prisma.registerEntry.deleteMany({
          where: { reoccurrenceId },
        });

        await prisma.reoccurrenceSplit.deleteMany({
          where: { reoccurrenceId },
        });

        return await prisma.reoccurrence.delete({
          where: {
            id: reoccurrenceId,
          },
          include: {
            splits: {
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            },
          },
        });
      },
      { maxWait: 20000, timeout: 60000 }
    );

    addRecalculateJob({ accountId: lookup.accountId });

    return reoccurrenceWithSplitsSchema.parse(deletedData);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
