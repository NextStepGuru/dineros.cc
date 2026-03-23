import { getQuery } from "h3";
import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { listPendingInvitesForAccount } from "~/server/services/accountInviteService";

const querySchema = z.object({
  accountId: z.string().min(1),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const { accountId } = querySchema.parse(getQuery(event));
    return await listPendingInvitesForAccount({ userId, accountId });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
