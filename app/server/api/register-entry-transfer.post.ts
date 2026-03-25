import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { createError } from "h3";
import { registerEntrySchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { z } from "zod";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { createId } from "@paralleldrive/cuid2";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const { userId } = getUser(event);

    // Define the schema for the request body
    const transferSchema = z.object({
      registerEntryId: z.string().nonempty("Register entry ID is required"),
      accountRegisterId: z.coerce.number().refine((val) => val !== 0, {
        message: "Source account register ID is required",
      }),
      targetAccountRegisterId: z.coerce.number().refine((val) => val !== 0, {
        message: "Target account register ID is required",
      }),
    });

    const { registerEntryId, accountRegisterId, targetAccountRegisterId } =
      transferSchema.parse(body);

    // Validate that source and target are different
    if (accountRegisterId === targetAccountRegisterId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Source and target account registers must be different",
      });
    }

    // Get the original register entry and validate user permission
    const originalEntry = await PrismaDb.registerEntry
      .findFirstOrThrow({
        where: {
          id: registerEntryId,
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
        },
        select: {
          id: true,
          description: true,
          amount: true,
          createdAt: true,
          reoccurrenceId: true,
          plaidId: true,
          plaidJson: true,
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
          statusMessage: "User does not have permission to view source entry",
        });
      });

    // Validate user has permission to target account register
    const targetRegister = await PrismaDb.accountRegister
      .findFirstOrThrow({
        where: {
          id: targetAccountRegisterId,
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
      })
      .catch(() => {
        throw createError({
          statusCode: 400,
          statusMessage: "User does not have permission to view target account",
        });
      });

    // Start transaction to ensure atomicity
    const result = await PrismaDb.$transaction(async (tx) => {
      // Create the entry in the target account register with same amount
      const transferEntry = await tx.registerEntry.create({
        data: {
          id: createId(),
          accountRegisterId: targetAccountRegisterId,
          sourceAccountRegisterId: accountRegisterId, // Track the source for reference
          description: originalEntry.description,
          amount: originalEntry.amount, // Same amount (not inverse)
          balance: 0, // Will be calculated by recalculate job
          isProjected: false,
          isCleared: true, // Mark as cleared since it's applied
          isPending: false,
          isBalanceEntry: false,
          isManualEntry: true,
          reoccurrenceId: originalEntry.reoccurrenceId,
          plaidId: originalEntry.plaidId,
          plaidJson: originalEntry.plaidJson as any, // Handle JSON type conversion
          createdAt: originalEntry.createdAt,
          hasBalanceReCalc: true,
        },
      });

      // Update the target account register balance and latestBalance
      await tx.accountRegister.update({
        where: {
          id: targetAccountRegisterId,
        },
        data: {
          balance: {
            increment: originalEntry.amount,
          },
          latestBalance: {
            increment: originalEntry.amount,
          },
        },
      });

      // Mark the original entry as cleared
      const updatedOriginalEntry = await tx.registerEntry.update({
        where: {
          id: registerEntryId,
        },
        data: {
          isProjected: false,
          isCleared: true,
          isPending: false,
          hasBalanceReCalc: true,
        },
      });

      return { transferEntry, updatedOriginalEntry };
    });

    // Trigger recalculate jobs for both accounts
    addRecalculateJob({ accountId: originalEntry.register.accountId });
    addRecalculateJob({ accountId: targetRegister.accountId });

    return {
      originalEntry: registerEntrySchema.parse(result.updatedOriginalEntry),
      transferEntry: registerEntrySchema.parse(result.transferEntry),
      message: "Transfer completed successfully",
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
