import { createError } from "h3";
import { z } from "zod";
import { privateUserSchema, publicProfileSchema } from "~/schema/zod";
import { prisma } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { withUpdatedEmailOtp } from "~/server/lib/mfa";
import HashService from "~/server/services/HashService";

const toggleEmailOtpSchema = z.object({
  enabled: z.boolean(),
  currentPassword: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = await readBody(event);
    const { enabled, currentPassword } = toggleEmailOtpSchema.parse(body);
    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const user = privateUserSchema.parse(lookup);

    const wasEnabled = Boolean(user.settings.mfa.emailOtp?.isEnabled);
    if (wasEnabled && !enabled) {
      if (!currentPassword?.trim()) {
        throw createError({
          statusCode: 400,
          statusMessage: "Current password is required to disable email OTP.",
        });
      }
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
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        settings: structuredClone(
          withUpdatedEmailOtp(user.settings, {
            isEnabled: enabled,
            isVerified: enabled,
          }),
        ),
      },
    });

    return publicProfileSchema.parse(updated);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
