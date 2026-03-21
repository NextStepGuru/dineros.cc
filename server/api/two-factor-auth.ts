import type { Prisma } from "@prisma/client";
import { randomInt } from "node:crypto";
import { generateSecret, generateURI } from "otplib";
import qrcode from "qrcode";
import { getUser } from "../lib/getUser";
import { prisma } from "../clients/prismaClient";
import { privateUserSchema } from "~/schema/zod";
import { handleApiError } from "~/server/lib/handleApiError";
import { withUpdatedTotp } from "~/server/lib/mfa";

const ISSUER = "Dineros.cc";
const LOGO_URL =
  "https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_128/v1737776329/pepe_solo_t0twqk.png";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const user = privateUserSchema.parse(lookup);

    const totp = user.settings.mfa?.totp;
    if (totp?.isEnabled && totp?.isVerified) {
      throw new Error("Two-factor authentication is already enabled.");
    }

    const secret = generateSecret();
    const uri = generateURI({
      issuer: ISSUER,
      label: user.email,
      secret,
    });
    const otpauthWithLogo = `${uri}&image=${encodeURIComponent(LOGO_URL)}`;

    // Generate backup codes for emergency access (CSPRNG; upper bound exclusive)
    const backupCodes = Array.from({ length: 8 }, () =>
      randomInt(100_000, 1_000_000).toString(),
    );

    const imageUrl = await qrcode.toDataURL(otpauthWithLogo);

    await prisma.user.update({
      where: { id: userId },
      data: {
        settings: structuredClone({
          ...user.settings,
          ...withUpdatedTotp(user.settings, {
            base32secret: secret,
            isEnabled: true,
            isVerified: false,
            backupCodes,
          }),
        }) as Prisma.InputJsonValue,
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
