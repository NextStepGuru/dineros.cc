import { createError } from "h3";
import { z } from "zod";
import { privateUserSchema, publicProfileSchema } from "~/schema/zod";
import { prisma } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { withUpdatedPasskeys } from "~/server/lib/mfa";
import HashService from "~/server/services/HashService";

const deletePasskeySchema = z.object({
  id: z.string().min(1),
  currentPassword: z.string().min(1, "Current password is required"),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = await readBody(event);
    const { id, currentPassword } = deletePasskeySchema.parse(body);

    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!lookup.password) {
      throw createError({
        statusCode: 400,
        statusMessage: "Password confirmation is not available for this account.",
      });
    }
    const passwordOk = await new HashService().verify(
      lookup.password,
      currentPassword,
    );
    if (!passwordOk) {
      throw createError({
        statusCode: 401,
        statusMessage: "Current password is incorrect.",
      });
    }
    const user = privateUserSchema.parse(lookup);
    const passkeys = user.settings.mfa.passkeys || [];
    const nextPasskeys = passkeys.filter((passkey) => passkey.id !== id);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        settings: structuredClone(
          withUpdatedPasskeys(user.settings, nextPasskeys),
        ),
      },
    });

    return publicProfileSchema.parse(updated);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
