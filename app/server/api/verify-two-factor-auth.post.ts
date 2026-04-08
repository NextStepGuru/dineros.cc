import type { Prisma } from "@prisma/client";
import { verify } from "otplib";
import { getUser } from "../lib/getUser";
import { prisma } from "../clients/prismaClient";
import { privateUserSchema } from "~/schema/zod";
import { z } from "zod";
import { handleApiError } from "~/server/lib/handleApiError";
import { withUpdatedTotp } from "~/server/lib/mfa";
import { sessionUserFromDb } from "~/server/lib/sessionUserProfile";

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

    const backupCodes = totp.backupCodes || [];
    const isBackupCode = backupCodes.includes(token);

    let nextSettings: Prisma.InputJsonValue;

    if (isBackupCode) {
      const updatedBackupCodes = backupCodes.filter((code) => code !== token);
      nextSettings = structuredClone(
        withUpdatedTotp(user.settings, {
          backupCodes: updatedBackupCodes,
          isVerified: true,
        }),
      ) as Prisma.InputJsonValue;
    } else {
      const result = await verify({
        secret: totp.base32secret,
        token,
        epochTolerance: 30,
      });
      nextSettings = structuredClone(
        withUpdatedTotp(user.settings, {
          isVerified: result.valid,
        }),
      ) as Prisma.InputJsonValue;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        settings: nextSettings,
      },
    });

    return sessionUserFromDb(updatedUser);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
