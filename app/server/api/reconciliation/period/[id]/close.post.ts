import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { closeReconciliationPeriod } from "~/server/services/reconciliationService";
import { closeReconciliationPeriodSchema } from "~/schema/reconciliation";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const params = paramsSchema.parse(event.context.params ?? {});
    const body = closeReconciliationPeriodSchema.parse(await readBody(event));
    return await closeReconciliationPeriod({
      userId,
      periodId: params.id,
      closeNote: body.closeNote,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
