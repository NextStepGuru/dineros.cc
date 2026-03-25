import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { getBillCenterSnapshot } from "~/server/services/billCenterService";

const querySchema = z.object({
  budgetId: z.coerce.number().int().positive(),
  from: z.string().optional(),
  to: z.string().optional(),
  includeIncome: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true"),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const query = querySchema.parse(getQuery(event));
    return await getBillCenterSnapshot({
      userId,
      budgetId: query.budgetId,
      from: query.from,
      to: query.to,
      includeIncome: query.includeIncome,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
