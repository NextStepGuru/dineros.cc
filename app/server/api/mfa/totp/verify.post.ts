import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { verify } from "otplib";
import { z } from "zod";
import { prisma } from "~/server/clients/prismaClient";
import { privateUserSchema } from "~/schema/zod";
import { handleApiError } from "~/server/lib/handleApiError";
import {
  clearPendingMfaSession,
  getPendingMfaSession,
  withUpdatedTotp,
} from "~/server/lib/mfa";
import { completeLogin } from "~/server/lib/completeLogin";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { token } = z.object({ token: z.string().min(1) }).parse(body);
    const session = await getPendingMfaSession(event);

    if (!session || !session.methods.includes("totp")) {
      setResponseStatus(event, 401);
      return { errors: "No pending TOTP challenge found." };
    }

    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
    });
    const user = privateUserSchema.parse(lookup);

    if (!user.settings.mfa.totp.base32secret) {
      setResponseStatus(event, 401);
      return { errors: "TOTP is not configured for this user." };
    }

    const backupCodes = user.settings.mfa.totp.backupCodes || [];
    const trimmedToken = token.trim();
    const isBackupCode = backupCodes.includes(trimmedToken);

    let isValid = false;
    if (isBackupCode) {
      const nextBackupCodes = backupCodes.filter(
        (code) => code !== trimmedToken,
      );
      await prisma.user.update({
        where: { id: user.id },
        data: {
          settings: JSON.parse(
            JSON.stringify(
              withUpdatedTotp(user.settings, {
                backupCodes: nextBackupCodes,
              }),
            ),
          ),
        },
      });
      isValid = true;
    } else {
      const result = await verify({
        secret: user.settings.mfa.totp.base32secret,
        token: trimmedToken,
        epochTolerance: 300,
      });
      isValid = result.valid;
    }

    if (!isValid) {
      setResponseStatus(event, 401);
      return { errors: "Invalid two-factor authentication token." };
    }

    await clearPendingMfaSession(event);
    return await completeLogin(event, user.id);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
