import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { reoccurrenceWithSplitsSchema } from "~/schema/zod";
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
      intervalCount,
      adjustBeforeIfOnWeekend,
      description,
      amount,
      lastAt,
      endAt,
      splits,
    } = reoccurrenceWithSplitsSchema.parse(body);

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

    const splitTargets = (splits ?? []).map((item) => item.transferAccountRegisterId);
    const accountIdsToValidate = Array.from(
      new Set(
        [transferAccountRegisterId, ...splitTargets].filter(
          (value): value is number => typeof value === "number" && value > 0,
        ),
      ),
    );

    if (
      accountIdsToValidate.some(
        (targetAccountRegisterId) => targetAccountRegisterId === accountRegisterId,
      )
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "Transfer target account cannot match source account.",
      });
    }

    if (accountIdsToValidate.length > 0) {
      const validTargetAccounts = await PrismaDb.accountRegister.findMany({
        where: {
          id: { in: accountIdsToValidate },
          accountId,
          account: {
            userAccounts: {
              some: {
                userId: user.userId,
              },
            },
          },
        },
        select: { id: true },
      });

      if (validTargetAccounts.length !== accountIdsToValidate.length) {
        throw createError({
          statusCode: 403,
          statusMessage: "Invalid transfer target account selected.",
        });
      }
    }

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
    const normalizedSplits = (splits ?? []).map((split, index) => ({
      transferAccountRegisterId: split.transferAccountRegisterId,
      amount: split.amount,
      description: split.description?.trim() || null,
      sortOrder: split.sortOrder ?? index,
    }));

    const reoccurrence = await PrismaDb.$transaction(async (prisma) => {
      const upserted = await prisma.reoccurrence.upsert({
        create: {
          accountId,
          accountRegisterId,
          transferAccountRegisterId,
          intervalId,
          intervalCount,
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
          intervalCount,
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

      await prisma.reoccurrenceSplit.deleteMany({
        where: {
          reoccurrenceId: upserted.id,
        },
      });

      if (normalizedSplits.length > 0) {
        await prisma.reoccurrenceSplit.createMany({
          data: normalizedSplits.map((split) => ({
            ...split,
            reoccurrenceId: upserted.id,
          })),
        });
      }

      return prisma.reoccurrence.findUniqueOrThrow({
        where: { id: upserted.id },
        include: {
          splits: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          },
        },
      });
    });

    addRecalculateJob({ accountId: lookup.accountId });

    return reoccurrenceWithSplitsSchema.parse(reoccurrence);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
