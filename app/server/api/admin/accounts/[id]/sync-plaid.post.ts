import { createError, getRouterParam } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { addPlaidSyncJob } from "~/server/clients/queuesClient";
import { ADMIN_AUDIT_ACTIONS } from "~/schema/zod";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";
import { recordAdminAudit } from "~/server/lib/recordAdminAudit";
import { dateTimeService } from "~/server/services/forecast/DateTimeService";

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

    const memberships = await prisma.userAccount.findMany({
      where: { accountId: id },
      select: { userId: true },
    });
    const userIds = [...new Set(memberships.map((m) => m.userId))];
    if (userIds.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: "Account has no members",
      });
    }

    const items = await prisma.plaidItem.findMany({
      where: { userId: { in: userIds } },
      select: { itemId: true },
    });

    if (items.length === 0) {
      return {
        message: "No Plaid items for this account’s members.",
        queued: 0,
        accountId: id,
      };
    }

    const ts = dateTimeService.nowDate().getTime();
    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      if (!row) continue;
      await addPlaidSyncJob(
        {
          name: `admin-account-${id}-plaid`,
          itemId: row.itemId,
        },
        {
          delay: 0,
          jobId: `admin-plaid-${id}-${row.itemId}-${ts}-${i}`,
        },
      );
    }

    await recordAdminAudit(event, {
      action: ADMIN_AUDIT_ACTIONS.ACCOUNT_PLAID_SYNC_QUEUED,
      targetAccountId: id,
      metadata: { itemCount: items.length },
    });

    return {
      message: `Queued Plaid sync for ${items.length} item(s).`,
      queued: items.length,
      accountId: id,
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
