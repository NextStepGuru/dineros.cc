import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import {
  getNotificationSnapshot,
  syncNotificationsForBudget,
} from "~/server/services/notificationCenterService";
import { dateTimeService } from "~/server/services/forecast";

const querySchema = z.object({
  budgetId: z.coerce.number().int().positive(),
  daysAhead: z.coerce.number().int().min(1).max(365).default(90),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const q = querySchema.parse(getQuery(event));
    await syncNotificationsForBudget({
      userId: user.userId,
      budgetId: q.budgetId,
      daysAhead: q.daysAhead,
    });
    const snapshot = await getNotificationSnapshot({
      userId: user.userId,
      budgetId: q.budgetId,
    });
    return {
      evaluatedAt: dateTimeService.toISOString(),
      daysAhead: q.daysAhead,
      alerts: snapshot.riskAlerts,
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
