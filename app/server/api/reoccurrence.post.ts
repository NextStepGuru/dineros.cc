import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError, type H3Event } from "h3";
import type { z } from "zod";
import { reoccurrenceWithSplitsSchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { dateTimeService } from "~/server/services/forecast/DateTimeService";
import { computeFirstNextOccurrenceDate } from "~/server/services/forecast/reoccurrenceIntervals";

type ReoccurrenceUpsertBody = z.infer<typeof reoccurrenceWithSplitsSchema>;
type PrismaDbClient = typeof PrismaDb;
type ReoccurrenceUpsertDb = Pick<
  PrismaDbClient,
  "reoccurrence" | "reoccurrenceSplit"
>;

function dateInputToString(v: string | Date): string {
  if (typeof v === "string") {
    return v;
  }
  if (v instanceof Date) {
    return v.toISOString();
  }
  return String(v);
}

function parseScheduleDates(
  lastAt: ReoccurrenceUpsertBody["lastAt"],
  endAt: ReoccurrenceUpsertBody["endAt"],
): { parsedLastAt: Date | null; parsedEndAt: Date | null } {
  return {
    parsedLastAt: lastAt
      ? dateTimeService.toDate(
          dateTimeService.parseInput(dateInputToString(lastAt)),
        )
      : null,
    parsedEndAt: endAt
      ? dateTimeService.toDate(
          dateTimeService.parseInput(dateInputToString(endAt)),
        )
      : null,
  };
}

async function ensureCategoryExistsWhenSet(
  db: PrismaDbClient,
  categoryId: string | null | undefined,
  accountId: string,
): Promise<void> {
  if (!categoryId) {
    return;
  }
  await db.category.findFirstOrThrow({
    where: {
      id: categoryId,
      accountId,
    },
  });
}

async function ensureSplitCategoriesValid(
  db: PrismaDbClient,
  accountId: string,
  splits: ReoccurrenceUpsertBody["splits"],
): Promise<void> {
  const splitCategoryIds = Array.from(
    new Set(
      (splits ?? [])
        .map((s) => s.categoryId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  if (splitCategoryIds.length === 0) {
    return;
  }
  const found = await db.category.findMany({
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

async function ensureTransferTargetsAuthorized(
  db: PrismaDbClient,
  userId: number,
  accountId: string,
  accountRegisterId: number,
  transferAccountRegisterId: ReoccurrenceUpsertBody["transferAccountRegisterId"],
  splits: ReoccurrenceUpsertBody["splits"],
): Promise<void> {
  const splitTargets = (splits ?? []).map((item) => item.transferAccountRegisterId);
  const accountIdsToValidate = Array.from(
    new Set(
      [transferAccountRegisterId, ...splitTargets].filter(
        (value): value is number => typeof value === "number" && value > 0,
      ),
    ),
  );

  if (accountIdsToValidate.includes(accountRegisterId)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Transfer target account cannot match source account.",
    });
  }

  if (accountIdsToValidate.length === 0) {
    return;
  }

  const validTargetAccounts = await db.accountRegister.findMany({
    where: {
      id: { in: accountIdsToValidate },
      accountId,
      account: {
        userAccounts: {
          some: {
            userId,
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

async function resolveAdjustmentAnchorDate(
  db: PrismaDbClient,
  body: ReoccurrenceUpsertBody,
  parsedLastAt: Date | null,
): Promise<Date | null> {
  const mode = body.amountAdjustmentMode ?? "NONE";
  if (mode === "NONE") {
    return null;
  }

  let parsedAdjustmentAnchorAt =
    body.amountAdjustmentAnchorAt != null && body.amountAdjustmentAnchorAt !== ""
      ? dateTimeService.toDate(
          dateTimeService.parseInput(
            dateInputToString(body.amountAdjustmentAnchorAt),
          ),
        )
      : null;

  if (body.amountAdjustmentIntervalId != null) {
    await db.interval.findFirstOrThrow({
      where: { id: body.amountAdjustmentIntervalId },
    });
  }
  if (!parsedAdjustmentAnchorAt && parsedLastAt) {
    const scheduleInterval = await db.interval.findUnique({
      where: { id: body.intervalId },
    });
    const firstNext = computeFirstNextOccurrenceDate({
      lastAt: parsedLastAt,
      intervalId: body.intervalId,
      intervalCount: body.intervalCount,
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
  return parsedAdjustmentAnchorAt;
}

function buildAdjustmentFields(
  mode: NonNullable<ReoccurrenceUpsertBody["amountAdjustmentMode"]> | "NONE",
  body: ReoccurrenceUpsertBody,
  parsedAdjustmentAnchorAt: Date | null,
) {
  if (mode === "NONE") {
    return {
      amountAdjustmentMode: "NONE" as const,
      amountAdjustmentDirection: null,
      amountAdjustmentValue: null,
      amountAdjustmentIntervalId: null,
      amountAdjustmentIntervalCount: 1,
      amountAdjustmentAnchorAt: null,
    };
  }
  return {
    amountAdjustmentMode: mode,
    amountAdjustmentDirection: body.amountAdjustmentDirection,
    amountAdjustmentValue: body.amountAdjustmentValue,
    amountAdjustmentIntervalId: body.amountAdjustmentIntervalId,
    amountAdjustmentIntervalCount: body.amountAdjustmentIntervalCount ?? 1,
    amountAdjustmentAnchorAt: parsedAdjustmentAnchorAt,
  };
}

function normalizeSplits(splits: ReoccurrenceUpsertBody["splits"]) {
  return (splits ?? []).map((split, index) => ({
    transferAccountRegisterId: split.transferAccountRegisterId,
    amountMode: split.amountMode ?? "FIXED",
    amount: split.amount,
    description: split.description?.trim() || null,
    categoryId: split.categoryId ?? null,
    sortOrder: split.sortOrder ?? index,
  }));
}

async function upsertReoccurrenceWithSplits(
  prisma: ReoccurrenceUpsertDb,
  body: ReoccurrenceUpsertBody,
  parsedLastAt: Date | null,
  parsedEndAt: Date | null,
  parsedAdjustmentAnchorAt: Date | null,
  normalizedSplits: ReturnType<typeof normalizeSplits>,
) {
  const mode = body.amountAdjustmentMode ?? "NONE";
  const adjustmentFields = buildAdjustmentFields(mode, body, parsedAdjustmentAnchorAt);

  const upserted = await prisma.reoccurrence.upsert({
    create: {
      accountId: body.accountId,
      accountRegisterId: body.accountRegisterId,
      transferAccountRegisterId: body.transferAccountRegisterId,
      intervalId: body.intervalId,
      intervalCount: body.intervalCount,
      adjustBeforeIfOnWeekend: body.adjustBeforeIfOnWeekend,
      description: body.description,
      amount: body.amount,
      lastAt: parsedLastAt,
      endAt: parsedEndAt,
      categoryId: body.categoryId ?? null,
      ...adjustmentFields,
    },
    update: {
      accountId: body.accountId,
      accountRegisterId: body.accountRegisterId,
      transferAccountRegisterId: body.transferAccountRegisterId,
      intervalId: body.intervalId,
      intervalCount: body.intervalCount,
      adjustBeforeIfOnWeekend: body.adjustBeforeIfOnWeekend,
      description: body.description,
      amount: body.amount,
      lastAt: parsedLastAt,
      endAt: parsedEndAt,
      categoryId: body.categoryId ?? null,
      ...adjustmentFields,
    },
    where: {
      id: body.id,
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
}

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const user = getUser(event);

    const parsed = reoccurrenceWithSplitsSchema.parse(body);

    const lookup = await PrismaDb.accountRegister.findFirstOrThrow({
      where: {
        id: parsed.accountRegisterId,
        account: {
          id: parsed.accountId,
          userAccounts: {
            some: {
              userId: user.userId,
            },
          },
        },
      },
    });

    await ensureCategoryExistsWhenSet(
      PrismaDb,
      parsed.categoryId,
      parsed.accountId,
    );
    await ensureSplitCategoriesValid(PrismaDb, parsed.accountId, parsed.splits);
    await ensureTransferTargetsAuthorized(
      PrismaDb,
      user.userId,
      parsed.accountId,
      parsed.accountRegisterId,
      parsed.transferAccountRegisterId,
      parsed.splits,
    );

    const { parsedLastAt, parsedEndAt } = parseScheduleDates(
      parsed.lastAt,
      parsed.endAt,
    );
    const parsedAdjustmentAnchorAt = await resolveAdjustmentAnchorDate(
      PrismaDb,
      parsed,
      parsedLastAt,
    );

    const normalizedSplits = normalizeSplits(parsed.splits);

    const reoccurrence = await PrismaDb.$transaction(
      async (prisma) =>
        upsertReoccurrenceWithSplits(
          prisma,
          parsed,
          parsedLastAt,
          parsedEndAt,
          parsedAdjustmentAnchorAt,
          normalizedSplits,
        ),
      { maxWait: 20000, timeout: 60000 },
    );

    addRecalculateJob({ accountId: lookup.accountId });

    return reoccurrenceWithSplitsSchema.parse(reoccurrence);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
