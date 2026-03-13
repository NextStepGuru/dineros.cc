import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { reoccurrenceSchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { dateTimeService } from "~/server/services/forecast/DateTimeService";

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

    const toDateString = (v: string | Date): string =>
      typeof v === "string" ? v : v instanceof Date ? v.toISOString() : String(v);
    const parsedLastAt = lastAt
      ? dateTimeService.toDate(
          dateTimeService.parseInput(toDateString(lastAt)),
        )
      : null;
    const parsedEndAt = endAt
      ? dateTimeService.toDate(
          dateTimeService.parseInput(toDateString(endAt)),
        )
      : null;
    const reoccurrence = await PrismaDb.reoccurrence.upsert({
      create: {
        accountId,
        accountRegisterId,
        transferAccountRegisterId,
        intervalId,
        adjustBeforeIfOnWeekend,
        description,
        amount,
        lastAt: parsedLastAt,
        endAt: parsedEndAt,
      },
      update: {
        accountId,
        accountRegisterId,
        transferAccountRegisterId,
        intervalId,
        adjustBeforeIfOnWeekend,
        description,
        amount,
        lastAt: parsedLastAt,
        endAt: parsedEndAt,
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
