import { createError, getRouterParam } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { listAccountMembers } from "~/server/services/accountMemberService";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const accountId = getRouterParam(event, "accountId");
    if (!accountId) {
      throw createError({ statusCode: 400, statusMessage: "Missing account id" });
    }
    return await listAccountMembers({ actorUserId: userId, accountId });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
