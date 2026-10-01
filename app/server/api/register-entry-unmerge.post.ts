import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { createError } from "h3";
import { registerEntrySchema, registerEntryUnmergeSchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast";

/**
 * Undo a merge: re-insert the entry that was deleted, using the audit
 * record written when the merge happened. Balance entries cannot be
 * merged, so a restored entry is never a balance entry.
 */
export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const { userId } = getUser(event);

    const { mergeAuditId } = registerEntryUnmergeSchema.parse(body);

    const audit = await PrismaDb.registerEntryMergeAudit.findUnique({
      where: { id: mergeAuditId },
    });

    if (!audit) {
      throw createError({
        statusCode: 404,
        statusMessage: "Merge record not found",
      });
    }

    if (audit.restoredAt) {
      throw createError({
        statusCode: 400,
        statusMessage: "This merge has already been undone",
      });
    }

    const register = await PrismaDb.accountRegister.findFirst({
      where: {
        id: audit.accountRegisterId,
        account: {
          userAccounts: {
            some: {
              userId,
            },
          },
        },
      },
      select: {
        accountId: true,
      },
    });

    if (!register) {
      throw createError({
        statusCode: 400,
        statusMessage:
          "User does not have permission to undo this merge",
      });
    }

    const existingEntry = await PrismaDb.registerEntry.findUnique({
      where: { id: audit.removedRegisterEntryId },
      select: { id: true },
    });

    if (existingEntry) {
      throw createError({
        statusCode: 400,
        statusMessage:
          "An entry with the original id already exists on this register",
      });
    }

    const restoredEntry = await PrismaDb.$transaction(async (tx) => {
      const entry = await tx.registerEntry.create({
        data: {
          id: audit.removedRegisterEntryId,
          accountRegisterId: audit.accountRegisterId,
          seq: audit.entrySeq,
          sourceAccountRegisterId: audit.entrySourceAccountRegisterId,
          createdAt: audit.entryCreatedAt,
          referenceId: audit.entryReferenceId,
          checkNo: audit.entryCheckNo,
          description: audit.entryDescription,
          reoccurrenceId: audit.entryReoccurrenceId,
          amount: audit.entryAmount,
          balance: 0,
          typeId: audit.entryTypeId,
          isProjected: audit.entryIsProjected,
          isPending: audit.entryIsPending,
          isCleared: audit.entryIsCleared,
          isManualEntry: audit.entryIsManualEntry,
          hasBalanceReCalc: true,
          plaidId: audit.entryPlaidId,
          plaidIdHash: audit.entryPlaidIdHash,
          plaidJson: audit.entryPlaidJson ?? undefined,
          categoryId: audit.entryCategoryId,
          categoryLocked: audit.entryCategoryLocked,
          categorySource: audit.entryCategorySource,
          memo: audit.entryMemo,
        },
      });

      await tx.registerEntryMergeAudit.update({
        where: { id: audit.id },
        data: { restoredAt: dateTimeService.nowDate() },
      });

      return entry;
    });

    addRecalculateJob({ accountId: register.accountId });

    return {
      restoredEntry: registerEntrySchema.parse(restoredEntry),
      mergeAuditId: audit.id,
      message: "Register entry restored successfully.",
    };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
