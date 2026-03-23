import { createError, getRouterParam } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { revokeAccountInvite } from "~/server/services/accountInviteService";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const raw = getRouterParam(event, "id");
    const inviteId = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isInteger(inviteId) || inviteId < 1) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid invite id",
      });
    }
    return await revokeAccountInvite({ userId, inviteId });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
