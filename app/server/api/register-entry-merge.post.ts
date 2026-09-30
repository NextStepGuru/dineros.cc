import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { createError } from "h3";
import { registerEntryMergeSchema, registerEntrySchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { handleApiError } from "~/server/lib/handleApiError";

/**
 * Merge duplicate transactions: keep one entry, delete the other.
 * Both entries must belong to the same register; balance entries are
 * never mergeable.
 */
export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const { userId } = getUser(event);

    const { accountRegisterId, keepRegisterEntryId, duplicateRegisterEntryId } =
      registerEntryMergeSchema.parse(body);

    if (keepRegisterEntryId === duplicateRegisterEntryId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Cannot merge an entry into itself",
      });
    }

    const membershipWhere = {
      accountRegisterId,
      register: {
        account: {
          userAccounts: {
            some: {
              userId,
            },
          },
        },
      },
    };

    const keptLookup = await PrismaDb.registerEntry
      .findFirstOrThrow({
        where: { id: keepRegisterEntryId, ...membershipWhere },
        select: {
          isBalanceEntry: true,
          register: {
            select: {
              accountId: true,
            },
          },
        },
      })
      .catch(() => {
        throw createError({
          statusCode: 400,
          statusMessage: "User does not have permission to keep entry",
        });
      });

    const duplicateLookup = await PrismaDb.registerEntry
      .findFirstOrThrow({
        where: { id: duplicateRegisterEntryId, ...membershipWhere },
        select: {
          isBalanceEntry: true,
        },
      })
      .catch(() => {
        throw createError({
          statusCode: 400,
          statusMessage: "User does not have permission to merge entry",
        });
      });

    if (keptLookup.isBalanceEntry || duplicateLookup.isBalanceEntry) {
      throw createError({
        statusCode: 400,
        statusMessage: "Balance entries cannot be merged",
      });
    }

    await PrismaDb.registerEntry
      .delete({
        where: {
          id: duplicateRegisterEntryId,
        },
      })
      .catch(() => {
        throw createError({
          statusCode: 400,
          statusMessage: "Failed to delete duplicate register entry",
        });
      });

    const keptEntry = await PrismaDb.registerEntry.findUniqueOrThrow({
      where: {
        id: keepRegisterEntryId,
      },
    });

    addRecalculateJob({ accountId: keptLookup.register.accountId });

    return {
      keptEntry: registerEntrySchema.parse(keptEntry),
      removedEntryId: duplicateRegisterEntryId,
      message: "Register entries merged successfully.",
    };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
