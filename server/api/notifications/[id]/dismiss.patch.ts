import { createError, getRouterParam } from "h3";
import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import {
  dismissNotification,
  getNotificationSnapshot,
  syncNotificationsForBudget,
} from "~/server/services/notificationCenterService";

const bodySchema = z.object({
  budgetId: z.coerce.number().int().positive(),
  status: z.enum(["dismissed", "resolved"]).optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const rawId = getRouterParam(event, "id");
    const notificationId = rawId ? Number.parseInt(rawId, 10) : Number.NaN;
    if (!Number.isInteger(notificationId) || notificationId < 1) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid notification id",
      });
    }
    const body = bodySchema.parse(await readBody(event));
    await dismissNotification({
      userId,
      budgetId: body.budgetId,
      notificationId,
    });
    await syncNotificationsForBudget({
      userId,
      budgetId: body.budgetId,
    });
    return await getNotificationSnapshot({
      userId,
      budgetId: body.budgetId,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
