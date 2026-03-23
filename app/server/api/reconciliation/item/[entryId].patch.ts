import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { updateReconciliationItem } from "~/server/services/reconciliationService";

const paramsSchema = z.object({
  entryId: z.string().min(1),
});

const bodySchema = z.object({
  isCleared: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const params = paramsSchema.parse(event.context.params ?? {});
    const body = bodySchema.parse(await readBody(event));
    return await updateReconciliationItem({
      userId,
      registerEntryId: params.entryId,
      isCleared: body.isCleared,
      note: body.note,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
