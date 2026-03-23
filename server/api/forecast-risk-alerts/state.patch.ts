import { z } from "zod";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast";
import {
  evaluateForecastRiskAlerts,
  getForecastRiskAlertStateEntries,
  type ForecastRiskAlertStateEntry,
  type ForecastRiskAlertStateStatus,
} from "~/server/services/forecastRiskAlertService";

const bodySchema = z.object({
  key: z.string().min(1),
  status: z.enum(["dismissed", "resolved"]),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const body = bodySchema.parse(await readBody(event));

    const existing = await getForecastRiskAlertStateEntries(user.userId);
    const withoutKey = existing.filter((e) => e.key !== body.key);
    const next: ForecastRiskAlertStateEntry[] = [
      ...withoutKey,
      {
        key: body.key,
        status: body.status as ForecastRiskAlertStateStatus,
        actedAt: dateTimeService.toISOString(),
      },
    ].slice(-500);

    const userRow = await PrismaDb.user.findUniqueOrThrow({
      where: { id: user.userId },
      select: { settings: true },
    });
    const settings = structuredClone(
      (userRow.settings ?? {}) as Record<string, unknown>,
    );
    const root =
      typeof settings.forecastRiskAlerts === "object" &&
      settings.forecastRiskAlerts !== null
        ? (settings.forecastRiskAlerts as Record<string, unknown>)
        : {};
    settings.forecastRiskAlerts = {
      ...root,
      items: next,
    };

    await PrismaDb.user.update({
      where: { id: user.userId },
      data: { settings },
    });

    const budgetIdRaw = getQuery(event).budgetId;
    const budgetId =
      typeof budgetIdRaw === "string"
        ? Number.parseInt(budgetIdRaw, 10)
        : Number.NaN;

    if (Number.isFinite(budgetId) && budgetId > 0) {
      return await evaluateForecastRiskAlerts({
        userId: user.userId,
        budgetId,
        daysAhead: 90,
      });
    }

    return { ok: true };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
