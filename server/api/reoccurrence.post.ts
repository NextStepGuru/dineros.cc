import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { reoccurrenceSchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { addRecalculateJob } from "~/server/clients/queuesClient";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const user = getUser(event);

    const {
      id,
      accountId,
      accountRegisterId,
      transferAccountRegisterId,
      intervalId,
      adjustBeforeIfOnWeekend,
      description,
      amount,
      lastAt,
      endAt,
    } = reoccurrenceSchema.parse(body);

    // Can the user create or update a reoccurrence for this account register?
    const lookup = await PrismaDb.accountRegister.findFirstOrThrow({
      where: {
        id: accountRegisterId,
        account: {
          id: accountId,
          userAccounts: {
            some: {
              userId: user.userId,
            },
          },
        },
      },
    });

    const reoccurrence = await PrismaDb.reoccurrence.upsert({
      create: {
        accountId,
        accountRegisterId,
        transferAccountRegisterId,
        intervalId,
        adjustBeforeIfOnWeekend,
        description,
        amount,
        lastAt: lastAt ? new Date(lastAt) : null,
        endAt: endAt ? new Date(endAt) : null,
      },
      update: {
        accountId,
        accountRegisterId,
        transferAccountRegisterId,
        intervalId,
        adjustBeforeIfOnWeekend,
        description,
        amount,
        lastAt: lastAt ? new Date(lastAt) : null,
        endAt: endAt ? new Date(endAt) : null,
      },
      where: {
        id,
      },
    });

    addRecalculateJob({ accountId: lookup.accountId });

    return reoccurrenceSchema.parse(reoccurrence);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
