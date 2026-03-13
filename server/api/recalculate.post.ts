import { z } from "zod";
import { handleApiError } from "~/server/lib/handleApiError";
import { createError } from "h3";
import {
  ForecastEngineFactory,
  dateTimeService,
} from "~/server/services/forecast";
import { prisma } from "~/server/clients/prismaClient";

const replaySchema = z.object({
  accountRegisterId: z.coerce.number().optional(),
  accountId: z.string().optional(),
  fixedNow: z.string().optional(),
  timezone: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { accountId, fixedNow, timezone, startDate, endDate } =
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

    return {
      success: true,
      entriesCalculated: result.registerEntries.length,
      entriesBalance: result.registerEntries.filter(
        (entry) => entry.isBalanceEntry
      ).length,
      accountRegisters: result.accountRegisters.length,
    };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
