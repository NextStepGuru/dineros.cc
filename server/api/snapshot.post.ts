import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import {
  assertUserOwnsAccount,
  createAccountSnapshot,
} from "~/server/services/accountSnapshotService";

const bodySchema = z.object({
  accountId: z.string().uuid(),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const body = bodySchema.parse(await readBody(event));
    await assertUserOwnsAccount(user.userId, body.accountId);
    const snapshot = await createAccountSnapshot(body.accountId);
    return {
      id: snapshot.id,
      createdAt: snapshot.createdAt.toISOString(),
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
