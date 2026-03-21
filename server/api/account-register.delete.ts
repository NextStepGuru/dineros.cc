import { addRecalculateJob } from "~/server/clients/queuesClient";
import { z } from "zod";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { accountRegisterSchema } from "~/schema/zod";
import type { H3Event } from "h3";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";

const accountRegisterIdQuerySchema = z.object({
  accountRegisterId: z.coerce.number().min(1),
});

export default defineEventHandler(async (event: H3Event) => {
  try {
    const query = getQuery(event);
    const user = getUser(event);

    const { accountRegisterId } = accountRegisterIdQuerySchema.parse(query);

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

    const archived = await PrismaDb.$transaction(
      async (prisma) => {
        const userAccountScope = {
          userAccounts: { some: { userId: user.userId } },
        };

        await prisma.savingsGoal.updateMany({
          where: {
            OR: [
              { sourceAccountRegisterId: accountRegisterId },
              { targetAccountRegisterId: accountRegisterId },
            ],
            account: userAccountScope,
          },
          data: { isArchived: true },
        });

        await prisma.accountRegister.updateMany({
          where: {
            account: userAccountScope,
            targetAccountRegisterId: accountRegisterId,
          },
          data: { targetAccountRegisterId: null },
        });
        await prisma.accountRegister.updateMany({
          where: {
            account: userAccountScope,
            collateralAssetRegisterId: accountRegisterId,
          },
          data: { collateralAssetRegisterId: null },
        });
        await prisma.accountRegister.updateMany({
          where: {
            account: userAccountScope,
            subAccountRegisterId: accountRegisterId,
          },
          data: { subAccountRegisterId: null },
        });

        await prisma.reoccurrence.updateMany({
          where: {
            transferAccountRegisterId: accountRegisterId,
            account: userAccountScope,
          },
          data: { transferAccountRegisterId: null },
        });

        await prisma.reoccurrenceSplit.deleteMany({
          where: {
            transferAccountRegisterId: accountRegisterId,
            reoccurrence: {
              account: userAccountScope,
            },
          },
        });

        await prisma.registerEntry.deleteMany({
          where: { accountRegisterId },
        });

        await prisma.reoccurrenceSplit.deleteMany({
          where: {
            reoccurrence: { accountRegisterId },
          },
        });

        await prisma.reoccurrenceSkip.deleteMany({
          where: { accountRegisterId },
        });

        await prisma.reoccurrencePlaidNameAlias.deleteMany({
          where: { accountRegisterId },
        });

        await prisma.reoccurrence.deleteMany({
          where: { accountRegisterId },
        });

        return prisma.accountRegister.update({
          where: { id: accountRegisterId },
          data: { isArchived: true },
        });
      },
      { maxWait: 20000, timeout: 60000 },
    );

    addRecalculateJob({ accountId: lookup.accountId });

    return accountRegisterSchema.parse(archived);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
