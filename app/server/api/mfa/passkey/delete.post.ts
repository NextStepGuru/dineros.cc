import { z } from "zod";
import { privateUserSchema, publicProfileSchema } from "~/schema/zod";
import { prisma } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { withUpdatedPasskeys } from "~/server/lib/mfa";

const deletePasskeySchema = z.object({
  id: z.string().min(1),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = await readBody(event);
    const { id } = deletePasskeySchema.parse(body);

    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const user = privateUserSchema.parse(lookup);
    const passkeys = user.settings.mfa.passkeys || [];
    const nextPasskeys = passkeys.filter((passkey) => passkey.id !== id);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        settings: JSON.parse(
          JSON.stringify(withUpdatedPasskeys(user.settings, nextPasskeys))
        ),
      },
    });

    return publicProfileSchema.parse(updated);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
