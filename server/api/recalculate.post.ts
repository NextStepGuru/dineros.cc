import { recalculateSchema } from "~/schema/zod";
import { handleApiError } from "~/server/lib/handleApiError";
import { ForecastEngineFactory } from "~/server/services/forecast";
import { prisma } from "~/server/clients/prismaClient";
import moment from "moment";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { accountId } = recalculateSchema.parse(body);

    if (!accountId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Account ID is required to recalculate account balances",
      });
    }

    // Run recalculation immediately instead of using queue
    const engine = ForecastEngineFactory.create(prisma);
    const context = {
      accountId,
      startDate: moment().startOf('month').toDate(),
      endDate: moment().add(2, 'years').toDate(),
    };

    const result = await engine.recalculate(context);

    if (!result.isSuccess) {
      throw createError({
        statusCode: 500,
        statusMessage: `Forecast calculation failed: ${result.errors?.join(', ')}`,
      });
    }

    return {
      success: true,
      entriesCalculated: result.registerEntries.length,
      entriesBalance: result.registerEntries.filter(entry => entry.isBalanceEntry).length,
      accountRegisters: result.accountRegisters.length,
    };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
