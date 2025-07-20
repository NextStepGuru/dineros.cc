import speakeasy from "speakeasy";
import qrcode from "qrcode";
import { getUser } from "../lib/getUser";
import { prisma } from "../clients/prismaClient";
import { privateUserSchema } from "~/schema/zod";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const user = privateUserSchema.parse(lookup);

    if (
      user.settings.speakeasy.isEnabled &&
      user.settings.speakeasy.isVerified
    ) {
      throw new Error("Two-factor authentication is already enabled.");
    }

    // Generate a unique secret for the user
    const secret = speakeasy.generateSecret({
      length: 512,
      name: `${user.email}+Dineros.cc`,
      issuer: "Dineros.cc",
    });

    if (!secret.otpauth_url) {
      setResponseStatus(event, 400);
      return { error: "Error generating OTP secret." };
    }

    // Generate backup codes for emergency access
    const backupCodes = Array.from({ length: 8 }, () =>
      Math.floor(100000 + Math.random() * 900000).toString()
    );

    const imageUrl = await qrcode.toDataURL(secret.otpauth_url);

    await prisma.user.update({
      where: { id: userId },
      data: {
        settings: JSON.parse(
          JSON.stringify({
            ...(user.settings || {}),
            speakeasy: {
              base32secret: secret.base32,
              isEnabled: true,
              backupCodes: backupCodes,
            },
          })
        ),
      },
    });

    return {
      dataUri: imageUrl,
      backupCodes: backupCodes,
    };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
