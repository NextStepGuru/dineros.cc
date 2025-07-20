import { addRecalculateJob } from "~/server/clients/queuesClient";
import { z } from "zod";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { accountRegisterSchema } from "~/schema/zod";
import type { H3Event } from "h3";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const query = getQuery(event);
    const user = getUser(event);

    const deleteAccountRegisterSchema = z.object({
      accountRegisterId: z.coerce.number().min(1),
    });

    const { accountRegisterId } = deleteAccountRegisterSchema.parse(query);

    // Can the user delete this account register?
    const lookup = await PrismaDb.accountRegister.findFirstOrThrow({
      where: {
        id: accountRegisterId,
        account: {
          userAccounts: {
            some: {
              userId: user.userId,
            },
          },
        },
      },
    });

    const deletedData = await PrismaDb.$transaction(
      async (prisma) => {
        await prisma.reoccurrence.deleteMany({
          where: {
            accountRegisterId,
          },
        });

        await prisma.registerEntry.deleteMany({
          where: { accountRegisterId },
        });

        return await prisma.accountRegister.delete({
          where: {
            id: accountRegisterId,
          },
        });
      },
      { maxWait: 20000, timeout: 60000 }
    );

    addRecalculateJob({ accountId: lookup.accountId });

    return accountRegisterSchema.parse(deletedData);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
