import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { createError } from "h3";
import { registerEntrySchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { createId } from "@paralleldrive/cuid2";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const user = getUser(event);

    const {
      id,
      accountRegisterId,
      description,
      reoccurrenceId,
      amount,
      balance,
      categoryId,
      isProjected,
      isReconciled,
      isCleared,
      isPending,
      isBalanceEntry,
      plaidId,
      plaidJson,
      createdAt,
    } = registerEntrySchema.parse(body);

    // Can the user create or update a register entry for this account?
    const lookup = await PrismaDb.accountRegister
      .findFirstOrThrow({
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
      })
      .catch(() => {
        throw createError({
          statusCode: 400,
          statusMessage: "User does not have permission to view",
        });
      });

    if (categoryId) {
      await PrismaDb.category.findFirstOrThrow({
        where: {
          id: categoryId,
          accountId: lookup.accountId,
        },
      });
    }

    const cuid = createId();

    let registerEntry = await PrismaDb.registerEntry
      .upsert({
        where: {
          id: id || cuid,
        },
        create: {
          id: cuid,
          accountRegisterId,
          description,
          reoccurrenceId,
          amount,
          balance,
          isProjected: false,
          isReconciled,
          isCleared,
          isPending: false,
          isBalanceEntry,
          isManualEntry: true,
          plaidId,
          plaidJson,
          createdAt,
          hasBalanceReCalc: true,
          categoryId: categoryId ?? null,
        },
        update: {
          accountRegisterId,
          description,
          reoccurrenceId,
          amount,
          balance,
          isProjected,
          isReconciled,
          isCleared,
          isPending,
          isBalanceEntry,
          isManualEntry: true,
          plaidId,
          plaidJson,
          createdAt,
          hasBalanceReCalc: true,
          categoryId: categoryId ?? null,
        },
      })
      .catch(() => {
        throw createError({
          statusCode: 400,
          statusMessage: "Failed to update register entry",
        });
      });

    if (registerEntry.isManualEntry) {
      if (
        dateTimeService
          .now()
          .utc()
          .set({
            hour: 0,
            minute: 0,
            second: 0,
            milliseconds: 0,
          })
          .isSameOrAfter(registerEntry.createdAt) &&
        !registerEntry.isPending
      ) {
        registerEntry = await PrismaDb.registerEntry.update({
          data: {
            isPending: true,
          },
          where: {
            id: registerEntry.id,
          },
        });
      } else if (
        dateTimeService
          .now()
          .utc()
          .set({
            hour: 0,
            minute: 0,
            second: 0,
            milliseconds: 0,
          })
          .isBefore(registerEntry.createdAt) &&
        registerEntry.isPending
      ) {
        registerEntry = await PrismaDb.registerEntry.update({
          data: {
            isPending: false,
          },
          where: {
            id: registerEntry.id,
          },
        });
      }
    }

    addRecalculateJob({ accountId: lookup.accountId });

    return registerEntrySchema.parse(registerEntry);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
