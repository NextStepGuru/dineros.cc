import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { updateStatementLine } from "~/server/services/reconciliationService";
import { patchStatementLineSchema } from "~/schema/reconciliation";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const params = paramsSchema.parse(event.context.params ?? {});
    const body = patchStatementLineSchema.parse(await readBody(event));
    return await updateStatementLine({
      userId,
      statementLineId: params.id,
      ignore: body.ignore,
      registerEntryId: body.registerEntryId,
      createLedgerEntry: body.createLedgerEntry,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
