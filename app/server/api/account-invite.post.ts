import { readBody } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { accountInviteCreateSchema } from "~/schema/zod";
import { createAccountInvite } from "~/server/services/accountInviteService";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = await readBody(event);
    const { accountId, email } = accountInviteCreateSchema.parse(body);
    return await createAccountInvite({
      inviterUserId: userId,
      accountId,
      email,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
