import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { getOpenReconciliationPeriodSummaries } from "~/server/services/reconciliationService";

const querySchema = z.object({
  budgetId: z.coerce.number().int().positive(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const query = querySchema.parse(getQuery(event));
    return await getOpenReconciliationPeriodSummaries({
      userId,
      budgetId: query.budgetId,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
