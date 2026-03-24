import { z } from "zod";
import { privateUserSchema, publicProfileSchema } from "~/schema/zod";
import { prisma } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { withUpdatedEmailOtp } from "~/server/lib/mfa";

const toggleEmailOtpSchema = z.object({
  enabled: z.boolean(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = await readBody(event);
    const { enabled } = toggleEmailOtpSchema.parse(body);
    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const user = privateUserSchema.parse(lookup);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        settings: JSON.parse(
          JSON.stringify(
            withUpdatedEmailOtp(user.settings, {
              isEnabled: enabled,
              isVerified: enabled,
            })
          )
        ),
      },
    });

    return publicProfileSchema.parse(updated);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
