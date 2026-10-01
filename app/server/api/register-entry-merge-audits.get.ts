import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { createError } from "h3";
import { registerEntryMergeAuditSchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";

/**
 * List merge audit records for a register, newest first, so a client can
 * offer "undo merge". Un-restored merges come first via restoredAt ordering.
 */
export default defineEventHandler(async (event: H3Event) => {
  try {
    const { userId } = getUser(event);

    const query = getQuery(event);
    const accountRegisterId = Number(query.accountRegisterId);

    if (!Number.isInteger(accountRegisterId) || accountRegisterId < 1) {
      throw createError({
        statusCode: 400,
        statusMessage: "accountRegisterId is required",
      });
    }

    const register = await PrismaDb.accountRegister.findFirst({
      where: {
        id: accountRegisterId,
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

    if (!register) {
      throw createError({
        statusCode: 400,
        statusMessage:
          "User does not have permission to view this register",
      });
    }

    const audits = await PrismaDb.registerEntryMergeAudit.findMany({
      where: { accountRegisterId },
      orderBy: [{ restoredAt: "asc" }, { mergedAt: "desc" }],
      take: 50,
    });

    return {
      audits: audits.map((audit) =>
        registerEntryMergeAuditSchema.parse({
          id: audit.id,
          keptRegisterEntryId: audit.keptRegisterEntryId,
          removedRegisterEntryId: audit.removedRegisterEntryId,
          entryDescription: audit.entryDescription,
          entryAmount: Number(audit.entryAmount),
          entryCreatedAt: audit.entryCreatedAt,
          mergedAt: audit.mergedAt,
          restoredAt: audit.restoredAt,
        }),
      ),
    };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
