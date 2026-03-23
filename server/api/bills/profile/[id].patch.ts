import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { updateBillProfile } from "~/server/services/billCenterService";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const bodySchema = z.object({
  kind: z.enum(["BILL", "INCOME", "TRANSFER"]).optional(),
  payee: z.string().max(255).nullable().optional(),
  isAutoPay: z.boolean().optional(),
  graceDays: z.coerce.number().int().min(0).max(31).optional(),
  expectedAmountLow: z.coerce.number().nullable().optional(),
  expectedAmountHigh: z.coerce.number().nullable().optional(),
  reminderDaysBefore: z.string().max(100).nullable().optional(),
  priority: z.coerce.number().int().min(0).max(10).optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const params = paramsSchema.parse(event.context.params ?? {});
    const body = bodySchema.parse(await readBody(event));
    return await updateBillProfile({
      userId,
      billProfileId: params.id,
      kind: body.kind,
      payee: body.payee,
      isAutoPay: body.isAutoPay,
      graceDays: body.graceDays,
      expectedAmountLow: body.expectedAmountLow,
      expectedAmountHigh: body.expectedAmountHigh,
      reminderDaysBefore: body.reminderDaysBefore,
      priority: body.priority,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
