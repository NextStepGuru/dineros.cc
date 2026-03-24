import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { evaluateBillReminders } from "~/server/services/billCenterService";

const bodySchema = z.object({
  budgetId: z.coerce.number().int().positive(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = bodySchema.parse(await readBody(event));
    return await evaluateBillReminders({
      userId,
      budgetId: body.budgetId,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
