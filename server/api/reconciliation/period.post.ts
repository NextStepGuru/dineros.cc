import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { openReconciliationPeriod } from "~/server/services/reconciliationService";

const bodySchema = z.object({
  budgetId: z.coerce.number().int().positive(),
  accountRegisterId: z.coerce.number().int().positive(),
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  statementEndingBalance: z.coerce.number(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = bodySchema.parse(await readBody(event));
    return await openReconciliationPeriod({
      userId,
      budgetId: body.budgetId,
      accountRegisterId: body.accountRegisterId,
      startDate: body.startDate,
      endDate: body.endDate,
      statementEndingBalance: body.statementEndingBalance,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
