import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { updateReconciliationPeriodBalances } from "~/server/services/reconciliationService";
import { patchReconciliationPeriodSchema } from "~/schema/reconciliation";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const params = paramsSchema.parse(event.context.params ?? {});
    const body = patchReconciliationPeriodSchema.parse(await readBody(event));
    return await updateReconciliationPeriodBalances({
      userId,
      periodId: params.id,
      statementOpeningBalance: body.statementOpeningBalance,
      statementEndingBalance: body.statementEndingBalance,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
