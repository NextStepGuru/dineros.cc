import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { registerEntrySchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { z } from "zod";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { createId } from "@paralleldrive/cuid2";
import moment from "moment";
import { dateTimeService } from "~/server/services/forecast";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const user = getUser(event);

    // Define the schema for transfer creation
    const transferCreateSchema = z.object({
      sourceAccountRegisterId: z.coerce.number().refine((val) => val !== 0, {
        message: "Source account register ID is required",
      }),
      targetAccountRegisterId: z.coerce.number().refine((val) => val !== 0, {
        message: "Target account register ID is required",
      }),
      amount: z.coerce.number().refine((val) => val !== 0, {
        message: "Amount is required and cannot be zero",
      }),
      description: z.string().nonempty("Description is required"),
      targetDescription: z.string().optional(),
      createdAt: z.string().nonempty("Date is required"),
    });

    const {
      sourceAccountRegisterId,
      targetAccountRegisterId,
      amount,
      description,
      targetDescription,
      createdAt,
    } = transferCreateSchema.parse(body);

    // Validate that source and target are different
    if (sourceAccountRegisterId === targetAccountRegisterId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Source and target account registers must be different",
      });
    }

    // Validate user has permission to source account register
    const sourceRegister = await PrismaDb.accountRegister
      .findFirstOrThrow({
        where: {
          id: sourceAccountRegisterId,
          account: {
            userAccounts: {
              some: {
                userId: user.userId,
              },
            },
          },
        },
        select: {
          id: true,
          accountId: true,
          name: true,
        },
      })
      .catch(() => {
        throw createError({
          statusCode: 400,
          statusMessage:
            "User does not have permission to access source account",
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
                userId: user.userId,
              },
            },
          },
        },
        select: {
          id: true,
          accountId: true,
          name: true,
        },
      })
      .catch(() => {
        throw createError({
          statusCode: 400,
          statusMessage:
            "User does not have permission to access target account",
        });
      });

    const entryDate = new Date(createdAt);

    // Determine if entries should be pending based on date
    const isPending = moment(entryDate)
      .utc()
      .set({ hour: 0, minute: 0, second: 0, milliseconds: 0 })
      .isSameOrBefore(
        dateTimeService
          .now()
          .utc()
          .set({ hour: 0, minute: 0, second: 0, milliseconds: 0 })
      );

    // Start transaction to ensure atomicity
    const result = await PrismaDb.$transaction(async (tx) => {
      // Create entry in source account (negative amount - money going out)
      const sourceEntry = await tx.registerEntry.create({
        data: {
          id: createId(),
          accountRegisterId: sourceAccountRegisterId,
          sourceAccountRegisterId: targetAccountRegisterId, // Track transfer destination
          description: description,
          amount: -Math.abs(amount), // Always negative for source
          balance: 0, // Will be calculated by recalculate job
          isProjected: false,
          isCleared: false,
          isPending: isPending,
          isBalanceEntry: false,
          isManualEntry: true,
          createdAt: entryDate,
          hasBalanceReCalc: true,
        },
      });

      // Create entry in target account (positive amount - money coming in)
      const targetEntry = await tx.registerEntry.create({
        data: {
          id: createId(),
          accountRegisterId: targetAccountRegisterId,
          sourceAccountRegisterId: sourceAccountRegisterId, // Track transfer source
          description:
            targetDescription || `Transfer from ${sourceRegister.name}`,
          amount: Math.abs(amount), // Always positive for target
          balance: 0, // Will be calculated by recalculate job
          isProjected: false,
          isCleared: false,
          isPending: isPending,
          isBalanceEntry: false,
          isManualEntry: true,
          createdAt: entryDate,
          hasBalanceReCalc: true,
        },
      });

      return { sourceEntry, targetEntry };
    });

    // Trigger recalculate jobs for both accounts
    addRecalculateJob({ accountId: sourceRegister.accountId });
    addRecalculateJob({ accountId: targetRegister.accountId });

    return {
      sourceEntry: registerEntrySchema.parse(result.sourceEntry),
      targetEntry: registerEntrySchema.parse(result.targetEntry),
      message: "Transfer created successfully",
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
