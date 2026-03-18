import { verify } from "otplib";
import { getUser } from "../lib/getUser";
import { prisma } from "../clients/prismaClient";
import { privateUserSchema, publicProfileSchema } from "~/schema/zod";
import { z } from "zod";
import { handleApiError } from "~/server/lib/handleApiError";
import { withUpdatedTotp } from "~/server/lib/mfa";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { token } = z.object({ token: z.string() }).parse(body);
    const { userId } = getUser(event);
    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const user = privateUserSchema.parse(lookup);

    const totp = user.settings.mfa?.totp;
    if (!totp?.base32secret) {
      return false;
    }

    // Check if the token is a backup code
    const backupCodes = totp.backupCodes || [];
    const isBackupCode = backupCodes.includes(token);

    let verificationResult = false;

    if (isBackupCode) {
      // Remove the used backup code
      const updatedBackupCodes = backupCodes.filter((code) => code !== token);

      await prisma.user.update({
        where: { id: userId },
        data: {
          settings: JSON.parse(
            JSON.stringify({
              ...withUpdatedTotp(user.settings, {
                backupCodes: updatedBackupCodes,
              }),
            })
          ),
        },
      });

      verificationResult = true;
    } else {
      // Verify TOTP token
      const result = await verify({
        secret: totp.base32secret,
        token,
        epochTolerance: 300, // ±300s (10 periods), matches previous speakeasy window
      });
      verificationResult = result.valid;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        settings: JSON.parse(
          JSON.stringify({
            ...withUpdatedTotp(user.settings, {
              isVerified: verificationResult,
            }),
          })
        ),
      },
    });

    return publicProfileSchema.parse(updatedUser);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
