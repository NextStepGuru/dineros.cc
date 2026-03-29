import { readBody } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { accountInviteCreateSchema } from "~/schema/zod";
import { createAccountInvite } from "~/server/services/accountInviteService";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = await readBody(event);
    const parsed = accountInviteCreateSchema.parse(body);
    return await createAccountInvite({
      inviterUserId: userId,
      accountIds: parsed.accountIds,
      email: parsed.email,
      permissions: parsed.permissions,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
