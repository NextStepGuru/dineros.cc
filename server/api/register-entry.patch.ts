import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { createError } from "h3";
import { registerEntrySchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { z } from "zod";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const { userId } = getUser(event);

    // Define the schema for the request body
    const patchSchema = z.object({
      registerEntryId: z.string().nonempty("Register entry ID is required"),
      accountRegisterId: z.coerce.number().refine((val) => val !== 0, {
        message: "Account register ID is required",
      }),
      isReconciled: z.boolean().optional(),
      isCleared: z.boolean().optional(),
    });

    const { registerEntryId, accountRegisterId, isReconciled, isCleared } =
      patchSchema.parse(body);

    // Can the user create or update a register entry for this account?
    const lookup = await PrismaDb.registerEntry
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
          statusMessage: "User does not have permission to view",
        });
      });

    const registerEntry = await PrismaDb.registerEntry
      .update({
        where: {
          id: registerEntryId,
        },
        data: {
          isReconciled,
          isCleared,
          isPending: !!(isReconciled || isCleared),
          hasBalanceReCalc: true,
        },
      })
      .catch(() => {
        throw createError({
          statusCode: 400,
          statusMessage: "Failed to update register entry",
        });
      });

    addRecalculateJob({ accountId: lookup.register.accountId });

    return registerEntrySchema.parse(registerEntry);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
