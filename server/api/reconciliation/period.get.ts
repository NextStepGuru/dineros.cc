import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { getOpenReconciliationPeriod } from "~/server/services/reconciliationService";

const querySchema = z.object({
  budgetId: z.coerce.number().int().positive(),
  accountRegisterId: z.coerce.number().int().positive(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const query = querySchema.parse(getQuery(event));
    return await getOpenReconciliationPeriod({
      userId,
      budgetId: query.budgetId,
      accountRegisterId: query.accountRegisterId,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
