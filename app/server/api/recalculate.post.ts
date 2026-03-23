import { z } from "zod";
import { handleApiError } from "~/server/lib/handleApiError";
import { createError } from "h3";
import {
  ForecastEngineFactory,
  dateTimeService,
} from "~/server/services/forecast";
import { prisma } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { evaluateForecastRiskAlerts } from "~/server/services/forecastRiskAlertService";
import { log } from "~/server/logger";

const replaySchema = z.object({
  accountRegisterId: z.coerce.number().optional(),
  accountId: z.string().optional(),
  budgetId: z.coerce.number().optional(),
  fixedNow: z.string().optional(),
  timezone: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { accountId, budgetId, fixedNow, timezone, startDate, endDate } =
      replaySchema.parse(body);

    if (!accountId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Account ID is required to recalculate account balances",
      });
    }

    const engine = ForecastEngineFactory.create(prisma);

    const buildContext = () => ({
      accountId,
      ...(budgetId != null && budgetId > 0 ? { budgetId } : {}),
      startDate: startDate
        ? dateTimeService.toDate(dateTimeService.parseInput(startDate))
        : dateTimeService.now().startOf("month").toDate(),
      endDate: endDate
        ? dateTimeService.toDate(dateTimeService.parseInput(endDate))
        : dateTimeService.now().add(2, "years").toDate(),
      logging: { enabled: false },
    });

    const runRecalc = async () => {
      const context = buildContext();
      return engine.recalculate(context);
    };

    const result =
      fixedNow != null && fixedNow !== ""
        ? await dateTimeService.withRunContext(
            {
              fixedNow,
              timezone: timezone ?? "UTC",
            },
            runRecalc,
          )
        : await runRecalc();

    if (!result.isSuccess) {
      throw createError({
        statusCode: 500,
        statusMessage: `Forecast calculation failed: ${result.errors?.join(
          ", "
        )}`,
      });
    }

    let riskAlertCount: number | null = null;
    if (budgetId != null && budgetId > 0) {
      try {
        const user = getUser(event);
        const riskResult = await evaluateForecastRiskAlerts({
          userId: user.userId,
          budgetId,
          daysAhead: 90,
        });
        riskAlertCount = riskResult.alerts.length;
      } catch (riskError) {
        log({
          level: "warn",
          message: "Failed to evaluate forecast risk alerts after recalc",
          data: {
            userId: user.userId,
            budgetId,
            error: riskError,
          },
        });
      }
    }

    return {
      success: true,
      entriesCalculated: result.registerEntries.length,
      entriesBalance: result.registerEntries.filter(
        (entry) => entry.isBalanceEntry
      ).length,
      accountRegisters: result.accountRegisters.length,
      ...(riskAlertCount !== null ? { riskAlertCount } : {}),
    };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
