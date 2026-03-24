import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { evaluateForecastRiskAlerts } from "~/server/services/forecastRiskAlertService";
import { log } from "~/server/logger";

const bodySchema = z.object({
  budgetId: z.coerce.number().int().positive(),
  daysAhead: z.coerce.number().int().min(1).max(365).optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const body = await readBody(event);
    const parsed = bodySchema.parse(body);

    const result = await evaluateForecastRiskAlerts({
      userId: user.userId,
      budgetId: parsed.budgetId,
      daysAhead: parsed.daysAhead ?? 90,
    });

    log({
      message: "Forecast risk alerts evaluated",
      data: {
        userId: user.userId,
        budgetId: parsed.budgetId,
        daysAhead: parsed.daysAhead ?? 90,
        alertCount: result.alerts.length,
      },
    });

    return result;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
