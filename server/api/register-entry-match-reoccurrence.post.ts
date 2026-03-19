import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { createError } from "h3";
import { registerEntrySchema, registerEntryMatchReoccurrenceSchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { normalizePlaidDescription } from "~/server/lib/normalizePlaidDescription";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const { userId } = getUser(event);

    const { registerEntryId, accountRegisterId, reoccurrenceId } =
      registerEntryMatchReoccurrenceSchema.parse(body);

    const entry = await PrismaDb.registerEntry.findFirst({
      where: {
        id: registerEntryId,
        accountRegisterId,
        register: {
          account: {
            userAccounts: {
              some: { userId },
            },
          },
        },
      },
    });

    if (!entry) {
      throw createError({
        statusCode: 400,
        statusMessage: "Register entry not found or access denied",
      });
    }

    if (entry.plaidId == null || entry.plaidId === "") {
      throw createError({
        statusCode: 400,
        statusMessage: "Only bank-imported transactions can be matched this way",
      });
    }

    await PrismaDb.reoccurrence.findFirstOrThrow({
      where: {
        id: reoccurrenceId,
        accountRegisterId,
        register: {
          account: {
            userAccounts: {
              some: { userId },
            },
          },
        },
      },
    });

    const normalizedName = normalizePlaidDescription(entry.description);
    if (!normalizedName) {
      throw createError({
        statusCode: 400,
        statusMessage: "Entry description is empty after normalization",
      });
    }

    await PrismaDb.$transaction(async (tx) => {
      await tx.reoccurrencePlaidNameAlias.upsert({
        where: {
          accountRegisterId_normalizedName: {
            accountRegisterId,
            normalizedName,
          },
        },
        create: {
          accountRegisterId,
          normalizedName,
          reoccurrenceId,
        },
        update: {
          reoccurrenceId,
        },
      });

      await tx.registerEntry.update({
        where: { id: registerEntryId },
        data: {
          reoccurrenceId,
          isPending: false,
          hasBalanceReCalc: true,
        },
      });
    });

    const updated = await PrismaDb.registerEntry.findUniqueOrThrow({
      where: { id: registerEntryId },
    });

    const { accountId } = await PrismaDb.accountRegister.findUniqueOrThrow({
      where: { id: updated.accountRegisterId },
      select: { accountId: true },
    });
    addRecalculateJob({ accountId });

    return registerEntrySchema.parse(updated);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
