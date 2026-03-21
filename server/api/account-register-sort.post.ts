import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { H3Event } from "h3";
import { getUser } from "../lib/getUser";
import { addRecalculateJob } from "../clients/queuesClient";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const { userId } = getUser(event);

    const { accountRegisters, sortMode } = body;

    if (!Array.isArray(accountRegisters)) {
      throw new TypeError("accountRegisters must be an array");
    }

    if (!sortMode || !["visual", "loan", "savings"].includes(sortMode)) {
      throw new Error("sortMode must be 'visual', 'loan', or 'savings'");
    }

    // Verify user has access to all account registers
    for (const accountRegister of accountRegisters) {

      // Determine which sort field to validate based on sort mode
      let sortField: string;
      let sortValue: number;

      switch (sortMode) {
        case "loan":
          sortField = "loanPaymentSortOrder";
          sortValue = accountRegister.loanPaymentSortOrder;
          break;
        case "savings":
          sortField = "savingsGoalSortOrder";
          sortValue = accountRegister.savingsGoalSortOrder;
          break;
        default:
          sortField = "sortOrder";
          sortValue = accountRegister.sortOrder;
          break;
      }

      if (!accountRegister.id || typeof sortValue !== "number") {
        throw new Error(
          `Each account register must have id and ${sortField}. Got: id=${accountRegister.id}, ${sortField}=${sortValue}`
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
    const updatePromises = accountRegisters.map((accountRegister) => {
      const updateData: any = {};

      switch (sortMode) {
        case "loan":
          updateData.loanPaymentSortOrder =
            accountRegister.loanPaymentSortOrder;
          break;
        case "savings":
          updateData.savingsGoalSortOrder =
            accountRegister.savingsGoalSortOrder;
          break;
        default:
          updateData.sortOrder = accountRegister.sortOrder;
          break;
      }

      return PrismaDb.accountRegister.update({
        where: { id: accountRegister.id },
        data: updateData,
      });
    });

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
