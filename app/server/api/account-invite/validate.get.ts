import { getQuery } from "h3";
import { z } from "zod";
import { handleApiError } from "~/server/lib/handleApiError";
import { getInviteValidationPayload } from "~/server/services/accountInviteService";

const querySchema = z.object({
  token: z.string().min(1),
});

export default defineEventHandler(async (event) => {
  try {
    const { token } = querySchema.parse(getQuery(event));
    return await getInviteValidationPayload(token);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
