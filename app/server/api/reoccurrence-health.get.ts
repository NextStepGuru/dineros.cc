import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { getReoccurrenceHealth } from "~/server/services/reoccurrenceHealthService";

const querySchema = z.object({
  budgetId: z.coerce.number().int().positive(),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const q = querySchema.parse(getQuery(event));
    return await getReoccurrenceHealth({
      userId: user.userId,
      budgetId: q.budgetId,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
