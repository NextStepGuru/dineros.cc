import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { getUser } from "../lib/getUser";
import { addRecalculateJob } from "../clients/queuesClient";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const { userId } = getUser(event);

    const { accountRegisters } = body;

    if (!Array.isArray(accountRegisters)) {
      throw new Error("accountRegisters must be an array");
    }

    console.log(
      "Received accountRegisters:",
      JSON.stringify(accountRegisters, null, 2)
    );

    // Verify user has access to all account registers
    for (const accountRegister of accountRegisters) {
      console.log("Checking accountRegister:", accountRegister);

      if (
        !accountRegister.id ||
        typeof accountRegister.sortOrder !== "number"
      ) {
        console.log("Invalid accountRegister:", accountRegister);
        throw new Error(
          `Each account register must have id and sortOrder. Got: id=${accountRegister.id}, sortOrder=${accountRegister.sortOrder}`
        );
      }

      // Check if user has access to this account register
      await PrismaDb.account.findFirstOrThrow({
        where: {
          id: accountRegister.accountId,
          userAccounts: {
            some: {
              userId,
            },
          },
        },
      });
    }

    // Update all account registers with new sort order
    const updatePromises = accountRegisters.map((accountRegister) =>
      PrismaDb.accountRegister.update({
        where: { id: accountRegister.id },
        data: { sortOrder: accountRegister.sortOrder },
      })
    );

    await Promise.all(updatePromises);

    // Get the accountId from the first account register for recalculate job
    const accountId = accountRegisters[0]?.accountId;
    if (accountId) {
      addRecalculateJob({ accountId });
    }

    return { success: true, message: "Sort order updated successfully" };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
