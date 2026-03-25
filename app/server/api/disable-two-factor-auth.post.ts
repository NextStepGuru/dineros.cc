import { privateUserSchema, publicProfileSchema } from "~/schema/zod";
import { prisma } from "../clients/prismaClient";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { withUpdatedEmailOtp, withUpdatedPasskeys, withUpdatedTotp } from "~/server/lib/mfa";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);

    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const user = privateUserSchema.parse(lookup);
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
        settings: JSON.parse(JSON.stringify(nextSettings)),
      },
    });

    return publicProfileSchema.parse(results);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
