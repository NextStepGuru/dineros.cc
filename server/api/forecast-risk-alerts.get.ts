import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { evaluateForecastRiskAlerts } from "~/server/services/forecastRiskAlertService";

const querySchema = z.object({
  budgetId: z.coerce.number().int().positive(),
  daysAhead: z.coerce.number().int().min(1).max(365).default(90),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const q = querySchema.parse(getQuery(event));
    return await evaluateForecastRiskAlerts({
      userId: user.userId,
      budgetId: q.budgetId,
      daysAhead: q.daysAhead,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
