import { createError, getRouterParam } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { ADMIN_AUDIT_ACTIONS } from "~/schema/zod";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";
import { recordAdminAudit } from "~/server/lib/recordAdminAudit";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Account id is required",
      });
    }

    const account = await prisma.account.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!account) {
      throw createError({ statusCode: 404, statusMessage: "Account not found" });
    }

    const result = await prisma.registerEntry.deleteMany({
      where: {
        isBalanceEntry: true,
        register: { accountId: id },
      },
    });

    await recordAdminAudit(event, {
      action: ADMIN_AUDIT_ACTIONS.ACCOUNT_BALANCE_ENTRIES_CLEANUP,
      targetAccountId: id,
      metadata: { deletedCount: result.count },
    });

    return {
      message: "Balance entries removed for this account.",
      deletedCount: result.count,
      accountId: id,
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
