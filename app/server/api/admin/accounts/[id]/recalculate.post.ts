import { createError, getRouterParam } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { addRecalculateJob } from "~/server/clients/queuesClient";
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

    const exists = await prisma.accountRegister.findFirst({
      where: { accountId: id, isArchived: false },
      select: { id: true },
    });
    if (!exists) {
      throw createError({
        statusCode: 404,
        statusMessage: "Account not found or has no active registers",
      });
    }

    await addRecalculateJob({ accountId: id });

    await recordAdminAudit(event, {
      action: ADMIN_AUDIT_ACTIONS.ACCOUNT_RECALCULATE_QUEUED,
      targetAccountId: id,
    });

    return { message: "Recalculate job queued.", accountId: id };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
