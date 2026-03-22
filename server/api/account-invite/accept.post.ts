import { readBody } from "h3";
import { handleApiError } from "~/server/lib/handleApiError";
import { accountInviteAcceptSchema } from "~/schema/zod";
import { acceptAccountInvite } from "~/server/services/accountInviteService";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const parsed = accountInviteAcceptSchema.parse(body);
    return await acceptAccountInvite(event, parsed);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
