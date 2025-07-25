import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { z } from "zod";
import { createError } from "h3";
import { getUser } from "../lib/getUser";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { handleApiError } from "~/server/lib/handleApiError";

// Define the schema for the request body
const deleteSchema = z.object({
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
    const { registerEntryId, accountRegisterId } = deleteSchema.parse(body);

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
          statusMessage: "Failed to delete register entry",
        });
      });

    // Perform the deletion operation
    await PrismaDb.registerEntry
      .delete({
        where: {
          id: registerEntryId,
        },
      })
      .catch(() => {
        throw createError({
          statusCode: 400,
          statusMessage: "Failed to delete register entry",
        });
      });

    addRecalculateJob({ accountId: lookup.register.accountId });

    // Return a success response
    return {
      message: "Register entry deleted successfully.",
    };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
