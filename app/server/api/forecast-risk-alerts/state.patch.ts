import { z } from "zod";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import {
  dismissNotification,
  getNotificationSnapshot,
  syncNotificationsForBudget,
} from "~/server/services/notificationCenterService";

const bodySchema = z.object({
  key: z.string().min(1),
  status: z.enum(["dismissed", "resolved"]),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const body = bodySchema.parse(await readBody(event));

    const budgetIdRaw = getQuery(event).budgetId;
    const budgetId =
      typeof budgetIdRaw === "string"
        ? Number.parseInt(budgetIdRaw, 10)
        : Number.NaN;

    if (Number.isFinite(budgetId) && budgetId > 0) {
      await syncNotificationsForBudget({
        userId: user.userId,
        budgetId,
      });
      const target = await PrismaDb.notificationEvent.findFirst({
        where: {
          userId: user.userId,
          budgetId,
          kind: "FORECAST_RISK",
          occurrenceKey: body.key,
          isActive: true,
        },
        select: { id: true },
      });
      if (target) {
        await dismissNotification({
          userId: user.userId,
          budgetId,
          notificationId: target.id,
        });
      }
      await syncNotificationsForBudget({
        userId: user.userId,
        budgetId,
      });
      const snapshot = await getNotificationSnapshot({
        userId: user.userId,
        budgetId,
      });
      return { alerts: snapshot.riskAlerts };
    }

    return { ok: true };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
