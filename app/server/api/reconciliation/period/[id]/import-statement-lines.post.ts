import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { importStatementLinesToLedger } from "~/server/services/reconciliationService";
import { importStatementLinesSchema } from "~/schema/reconciliation";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const params = paramsSchema.parse(event.context.params ?? {});
    const body = importStatementLinesSchema.parse((await readBody(event)) ?? {});
    return await importStatementLinesToLedger({
      userId,
      periodId: params.id,
      statementLineIds: body.statementLineIds,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
