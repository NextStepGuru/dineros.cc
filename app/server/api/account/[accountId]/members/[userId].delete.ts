import { createError, getRouterParam } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { removeAccountMember } from "~/server/services/accountMemberService";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const accountId = getRouterParam(event, "accountId");
    const targetUserIdRaw = getRouterParam(event, "userId");
    if (!accountId || !targetUserIdRaw) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing account or user id",
      });
    }
    const targetUserId = Number.parseInt(targetUserIdRaw, 10);
    if (!Number.isInteger(targetUserId) || targetUserId < 1) {
      throw createError({ statusCode: 400, statusMessage: "Invalid user id" });
    }
    return await removeAccountMember({
      actorUserId: userId,
      accountId,
      targetUserId,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
