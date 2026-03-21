import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError, type H3Event } from "h3";
import { reoccurrenceWithSplitsSchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { dateTimeService } from "~/server/services/forecast/DateTimeService";
import { computeFirstNextOccurrenceDate } from "~/server/services/forecast/reoccurrenceIntervals";

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
      categoryId,
      amountAdjustmentMode,
      amountAdjustmentDirection,
      amountAdjustmentValue,
      amountAdjustmentIntervalId,
      amountAdjustmentIntervalCount,
      amountAdjustmentAnchorAt,
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

    if (categoryId) {
      await PrismaDb.category.findFirstOrThrow({
        where: {
          id: categoryId,
          accountId,
        },
      });
    }

    const splitCategoryIds = Array.from(
      new Set(
        (splits ?? [])
          .map((s) => s.categoryId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );
    if (splitCategoryIds.length > 0) {
      const found = await PrismaDb.category.findMany({
        where: { id: { in: splitCategoryIds }, accountId },
        select: { id: true },
      });
      if (found.length !== splitCategoryIds.length) {
        throw createError({
          statusCode: 400,
          statusMessage: "Invalid category on a split.",
        });
      }
    }

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
    let parsedAdjustmentAnchorAt =
      amountAdjustmentAnchorAt != null && amountAdjustmentAnchorAt !== ""
        ? dateTimeService.toDate(
            dateTimeService.parseInput(toDateString(amountAdjustmentAnchorAt)),
          )
        : null;

    const mode = amountAdjustmentMode ?? "NONE";
    if (mode !== "NONE") {
      if (amountAdjustmentIntervalId != null) {
        await PrismaDb.interval.findFirstOrThrow({
          where: { id: amountAdjustmentIntervalId },
        });
      }
      if (!parsedAdjustmentAnchorAt && parsedLastAt) {
        const scheduleInterval = await PrismaDb.interval.findUnique({
          where: { id: intervalId },
        });
        const firstNext = computeFirstNextOccurrenceDate({
          lastAt: parsedLastAt,
          intervalId,
          intervalCount,
          intervalName: scheduleInterval?.name,
        });
        parsedAdjustmentAnchorAt = firstNext ?? null;
      }
      if (!parsedAdjustmentAnchorAt) {
        throw createError({
          statusCode: 400,
          statusMessage:
            "Amount adjustment requires a last run date or an explicit adjustment anchor date.",
        });
      }
    }

    const normalizedSplits = (splits ?? []).map((split, index) => ({
      transferAccountRegisterId: split.transferAccountRegisterId,
      amount: split.amount,
      description: split.description?.trim() || null,
      categoryId: split.categoryId ?? null,
      sortOrder: split.sortOrder ?? index,
    }));

    const reoccurrence = await PrismaDb.$transaction(async (prisma) => {
      const adjustmentFields =
        mode === "NONE"
          ? {
              amountAdjustmentMode: "NONE" as const,
              amountAdjustmentDirection: null,
              amountAdjustmentValue: null,
              amountAdjustmentIntervalId: null,
              amountAdjustmentIntervalCount: 1,
              amountAdjustmentAnchorAt: null,
            }
          : {
              amountAdjustmentMode: mode,
              amountAdjustmentDirection: amountAdjustmentDirection!,
              amountAdjustmentValue: amountAdjustmentValue!,
              amountAdjustmentIntervalId: amountAdjustmentIntervalId!,
              amountAdjustmentIntervalCount: amountAdjustmentIntervalCount ?? 1,
              amountAdjustmentAnchorAt: parsedAdjustmentAnchorAt,
            };

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
          categoryId: categoryId ?? null,
          ...adjustmentFields,
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
          categoryId: categoryId ?? null,
          ...adjustmentFields,
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
