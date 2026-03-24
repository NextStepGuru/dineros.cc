import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { updateBillInstanceStatus } from "~/server/services/billCenterService";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const bodySchema = z.object({
  status: z.enum([
    "UPCOMING",
    "DUE_SOON",
    "DUE_TODAY",
    "OVERDUE",
    "PAID",
    "SKIPPED",
    "PARTIAL",
  ]),
  note: z.string().max(500).nullable().optional(),
  paidAmount: z.coerce.number().nullable().optional(),
  paidRegisterEntryId: z.string().nullable().optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const params = paramsSchema.parse(event.context.params ?? {});
    const body = bodySchema.parse(await readBody(event));
    return await updateBillInstanceStatus({
      userId,
      billInstanceId: params.id,
      status: body.status,
      note: body.note,
      paidAmount: body.paidAmount,
      paidRegisterEntryId: body.paidRegisterEntryId,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
