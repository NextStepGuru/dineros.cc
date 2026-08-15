import { handleApiError } from "~/server/lib/handleApiError";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { z } from "zod";
import { getUser } from "../lib/getUser";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { dateTimeService } from "~/server/services/forecast";
import { calculateNextOccurrenceDate } from "~/server/services/forecast/reoccurrenceIntervals";
import { createError } from "h3";

// Define the schema for the request body
const skipPost = z.object({
  registerEntryId: z.string().nonempty("Register entry ID is required"),
  accountRegisterId: z.coerce.number().refine((val) => val !== 0, {
    message: "Account register ID is required",
  }),
});

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const user = getUser(event);

    // Parse and validate the request body
    const { registerEntryId, accountRegisterId } = skipPost.parse(body);

    // can the user delete this register entry?
    const lookup = await PrismaDb.registerEntry
      .findFirstOrThrow({
        where: {
          id: registerEntryId,
          accountRegisterId,
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
      })
      .catch(() => {
        throw createError({
          statusCode: 400,
          statusMessage: "Failed to skip register entry",
        });
      });

    if (!lookup.reoccurrenceId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid register entry ID or account register ID",
      });
    }

    const reoccurrence = await PrismaDb.reoccurrence
      .findFirstOrThrow({
        select: {
          id: true,
          lastAt: true,
          intervalCount: true,
          intervalId: true,
          scheduleAnchorAt: true,
          interval: true,
          accountId: true,
        },
        where: {
          id: lookup.reoccurrenceId,
        },
      })
      .catch(() => {
        throw createError({
          statusCode: 400,
          statusMessage: "Failed to skip register entry",
        });
      });

    await PrismaDb.$transaction(async (prisma) => {
      await prisma.registerEntry.delete({
        where: {
          id: registerEntryId,
        },
      });

      // Always persist a skip row — source of truth for forecast generation
      await prisma.reoccurrenceSkip.create({
        data: {
          reoccurrenceId: reoccurrence.id,
          accountId: reoccurrence.accountId,
          accountRegisterId: lookup.accountRegisterId,
          skippedAt: lookup.createdAt,
        },
      });

      // Optional lastAt bump when skipping the immediate next occurrence
      if (reoccurrence.lastAt) {
        const nextOccurrence = calculateNextOccurrenceDate({
          lastAt: dateTimeService.toDate(reoccurrence.lastAt),
          intervalId: reoccurrence.intervalId,
          intervalCount: reoccurrence.intervalCount,
          intervalName: reoccurrence.interval.name,
          scheduleAnchorAt: reoccurrence.scheduleAnchorAt,
        });

        if (
          nextOccurrence &&
          dateTimeService.isSameOrBefore(lookup.createdAt, nextOccurrence)
        ) {
          await prisma.reoccurrence.update({
            where: {
              id: reoccurrence.id,
            },
            data: {
              lastAt: nextOccurrence.toISOString(),
            },
          });
        }
      }
    }).catch(() => {
      throw createError({
        statusCode: 400,
        statusMessage: "Failed to skip register entry",
      });
    });

    addRecalculateJob({ accountId: reoccurrence.accountId });

    return {
      message: "Skipped register entry successfully.",
    };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
