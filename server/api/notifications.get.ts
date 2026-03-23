import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import {
  getNotificationSnapshot,
  syncNotificationsForBudget,
} from "~/server/services/notificationCenterService";

const querySchema = z.object({
  budgetId: z.coerce.number().int().positive(),
  daysAhead: z.coerce.number().int().min(1).max(365).default(90),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const query = querySchema.parse(getQuery(event));
    await syncNotificationsForBudget({
      userId,
      budgetId: query.budgetId,
      daysAhead: query.daysAhead,
    });
    const snapshot = await getNotificationSnapshot({
      userId,
      budgetId: query.budgetId,
    });
    return {
      ...snapshot,
      riskStatus: "ok" as const,
      recurringStatus: "ok" as const,
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
