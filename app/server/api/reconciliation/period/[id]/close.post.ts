import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { closeReconciliationPeriod } from "~/server/services/reconciliationService";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const bodySchema = z.object({
  closeNote: z.string().max(500).nullable().optional(),
  createAdjustmentEntry: z.boolean().optional().default(false),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const params = paramsSchema.parse(event.context.params ?? {});
    const body = bodySchema.parse(await readBody(event));
    return await closeReconciliationPeriod({
      userId,
      periodId: params.id,
      closeNote: body.closeNote,
      createAdjustmentEntry: body.createAdjustmentEntry,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
