import speakeasy from "speakeasy";
import { readBody, setResponseStatus, setCookie } from "h3";
import { z } from "zod";
import {
  loginSchema,
  privateUserSchema,
  publicProfileSchema,
} from "~/schema/zod";
import env from "../env";
import HashService from "../services/HashService";
import JwtService from "../services/JwtService";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { withErrorHandler } from "~/server/lib/withErrorHandler";
import { dateTimeService } from "~/server/services/forecast";

async function loginHandler(event: any) {
  const body = await readBody(event);
  let email: string;
  let password: string;
  let tokenChallenge: string | undefined;
  try {
    const parsed = loginSchema
      .extend({ tokenChallenge: z.string().optional() })
      .parse(body);
    email = parsed.email;
    password = parsed.password;
    tokenChallenge = parsed.tokenChallenge;
  } catch (parseErr) {
    throw parseErr;
  }

  // Find user by email
  const lookup = await PrismaDb.user.findFirst({
    where: { email },
  });

  if (!lookup) {
    setResponseStatus(event, 401);
    return { errors: "Invalid email or password." };
  }

  const user = privateUserSchema.parse(lookup);

  if (!user || !user.password) {
    setResponseStatus(event, 401);
    return { errors: "Invalid email or password." };
  }

  // Validate the password
  const isPasswordValid = await new HashService().verify(
    user.password,
    password
  );
  if (!isPasswordValid) {
    setResponseStatus(event, 401);
    return { errors: "Invalid email or password." };
  }

  if (
    user.settings.speakeasy.isEnabled &&
    user.settings.speakeasy.isVerified &&
    user.settings.speakeasy.base32secret &&
    !tokenChallenge
  ) {
    setResponseStatus(event, 200);
    return { twoFactorChallengeRequired: true };
  } else if (
    user.settings.speakeasy.isEnabled &&
    user.settings.speakeasy.isVerified &&
    user.settings.speakeasy.base32secret &&
    tokenChallenge
  ) {
    // Check if the token is a backup code
    const backupCodes = user.settings.speakeasy.backupCodes || [];
    const isBackupCode = backupCodes.includes(tokenChallenge);

    let verificationResult = false;

    if (isBackupCode) {
      // Remove the used backup code
      const updatedBackupCodes = backupCodes.filter(
        (code) => code !== tokenChallenge
      );

      await PrismaDb.user.update({
        where: { id: user.id },
        data: {
          settings: JSON.parse(
            JSON.stringify({
              ...user.settings,
              speakeasy: {
                ...user.settings.speakeasy,
                backupCodes: updatedBackupCodes,
              },
            })
          ),
        },
      });

      verificationResult = true;
    } else {
      // Verify TOTP token
      verificationResult = speakeasy.totp.verify({
        secret: user.settings.speakeasy.base32secret,
        encoding: "base32",
        token: tokenChallenge,
        window: 10,
      });
    }

    if (!verificationResult) {
      setResponseStatus(event, 401);
      return { errors: "Invalid two-factor authentication token." };
    }
  }

  const jwt = new JwtService();
  // Generate JWT token
  const token = await jwt.sign({ userId: user.id });

  await PrismaDb.user.update({
    where: { id: user.id },
    data: { lastAccessedAt: dateTimeService.nowDate() },
  });

  // Set the token as a cookie
  setCookie(event, "authToken", token, {
    secure: env.NODE_ENV === "production",
    maxAge: 86400, // 24 hours - match client-side configuration
    path: "/",
    sameSite: "lax",
    httpOnly: false, // Allow client-side access
  });
  setResponseStatus(event, 200);
  return { token, message: null, user: publicProfileSchema.parse(user) };
}

export default withErrorHandler(loginHandler);
