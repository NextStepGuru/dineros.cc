import { createError, readBody } from "h3";
import { z } from "zod";
import { privateUserSchema, publicProfileSchema } from "~/schema/zod";
import { prisma } from "../clients/prismaClient";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { withUpdatedEmailOtp, withUpdatedPasskeys, withUpdatedTotp } from "~/server/lib/mfa";
import HashService from "../services/HashService";

const bodySchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = await readBody(event);
    const { currentPassword } = bodySchema.parse(body);

    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const user = privateUserSchema.parse(lookup);
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
    const disabledTotp = withUpdatedTotp(user.settings, {
      isEnabled: false,
      isVerified: false,
      base32secret: undefined,
      backupCodes: [],
    });
    const noPasskeys = withUpdatedPasskeys(disabledTotp, []);
    const nextSettings = withUpdatedEmailOtp(noPasskeys, {
      isEnabled: false,
      isVerified: false,
    });

    const results = await prisma.user.update({
      where: { id: userId },
      data: {
        settings: structuredClone(nextSettings),
      },
    });

    return publicProfileSchema.parse(results);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
