import speakeasy from "speakeasy";
import { createHash } from "node:crypto";
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
import { log } from "~/server/logger";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || !local) return "invalid-email-format";
  return `${local.slice(0, 2)}***@${domain}`;
}

async function loginHandler(event: any) {
  const body = await readBody(event);
  const normalizedBody =
    typeof body?.email === "string"
      ? {
          ...body,
          // Normalize common invisible characters from copy/paste/mobile keyboards before Zod validation.
          email: body.email.replace(/[\u200B-\u200D\uFEFF]/g, "").trim(),
        }
      : body;
  let email: string;
  let password: string;
  let tokenChallenge: string | undefined;
  const parsed = loginSchema
    .extend({ tokenChallenge: z.string().optional() })
    .parse(normalizedBody);
  email = parsed.email.trim();
  password = parsed.password;
  tokenChallenge = parsed.tokenChallenge;
  const lowerCaseEmail = email.toLowerCase();

  const loginDebugData =
    process.env.LOGIN_DEBUG === "1"
      ? (() => {
          const enc = env?.DB_ENCRYPTION_KEY ?? "";
          const procEnc = process.env.DB_ENCRYPTION_KEY ?? "";
          const fp = (s: string) =>
            createHash("sha256").update(s).digest("hex").slice(0, 16);
          return {
            encryptionKeyFingerprint: fp(enc),
            encryptionKeyLen: enc.length,
            processEnvEncKeyLen: procEnc.length,
            processEnvMatchesParsedEnc:
              enc.length === procEnc.length && fp(enc) === fp(procEnc),
            decryptionKeysCount: Array.isArray(env?.DB_DECRYPTION_KEYS)
              ? env.DB_DECRYPTION_KEYS.length
              : 0,
            decryptionKeyFingerprints: Array.isArray(env?.DB_DECRYPTION_KEYS)
              ? env.DB_DECRYPTION_KEYS.map((k: string) =>
                  createHash("sha256").update(k).digest("hex").slice(0, 8),
                )
              : [],
            processEnvDecryptionKeysRawLen: (
              process.env.DB_DECRYPTION_KEYS ?? ""
            ).length,
            processEnvDecryptionKeysContainsComma: (
              process.env.DB_DECRYPTION_KEYS ?? ""
            ).includes(","),
          };
        })()
      : undefined;

  log({
    message: "[LOGIN][EMAIL] Login attempt received",
    level: "info",
    data: {
      email: maskEmail(email),
      hasTokenChallenge: Boolean(tokenChallenge),
      ...(loginDebugData ?? {}),
    },
  });

  // Find user by email. Prefer unique lookups + explicit hash fallback for encrypted fields.
  const hashedEmail = createHash("sha512").update(email, "utf8").digest("hex");
  const lowerCaseHashedEmail =
    lowerCaseEmail === email
      ? hashedEmail
      : createHash("sha512").update(lowerCaseEmail, "utf8").digest("hex");

  let lookup = await PrismaDb.user.findUnique({
    where: { email },
  });

  if (!lookup) {
    // Compatibility fallback (tests/mocks and environments where extension rewrite differs).
    lookup = await PrismaDb.user.findFirst({
      where: { email },
    });
  }

  if (!lookup) {
    lookup = await PrismaDb.user.findUnique({
      where: { emailHash: hashedEmail },
    });
  }

  if (!lookup && lowerCaseEmail !== email) {
    lookup = await PrismaDb.user.findUnique({
      where: { email: lowerCaseEmail },
    });
  }

  if (!lookup && lowerCaseHashedEmail !== hashedEmail) {
    lookup = await PrismaDb.user.findUnique({
      where: { emailHash: lowerCaseHashedEmail },
    });
  }

  if (!lookup) {
    log({
      message: "[LOGIN][EMAIL] User lookup failed",
      level: "warn",
      data: {
        email: maskEmail(email),
        usedLowerCaseFallback: lowerCaseEmail !== email,
      },
    });
    setResponseStatus(event, 401);
    return { errors: "Invalid email or password." };
  }

  // Use request email for schema parse: DB may return encrypted or non-decrypted value in production.
  const user = privateUserSchema.parse({ ...lookup, email });

  if (!user || !user.password) {
    log({
      message: "[LOGIN][EMAIL] User missing password hash",
      level: "warn",
      data: {
        userId: user?.id ?? null,
        email: maskEmail(email),
      },
    });
    setResponseStatus(event, 401);
    return { errors: "Invalid email or password." };
  }

  // Validate the password
  let isPasswordValid = false;
  try {
    isPasswordValid = await new HashService().verify(user.password, password);
  } catch (error) {
    log({
      message: "[LOGIN][EMAIL] Password verification threw",
      level: "error",
      data: {
        userId: user.id,
        email: maskEmail(email),
        error,
      },
    });
    throw error;
  }

  log({
    message: "[LOGIN][EMAIL] Password verification completed",
    level: "info",
    data: {
      userId: user.id,
      email: maskEmail(email),
      isPasswordValid,
    },
  });

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
    log({
      message: "[LOGIN][EMAIL] Two-factor challenge required",
      level: "info",
      data: {
        userId: user.id,
        email: maskEmail(email),
      },
    });
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

    log({
      message: "[LOGIN][EMAIL] Two-factor verification completed",
      level: verificationResult ? "info" : "warn",
      data: {
        userId: user.id,
        email: maskEmail(email),
        usedBackupCode: isBackupCode,
        verificationResult,
      },
    });

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
  log({
    message: "[LOGIN][EMAIL] Login successful",
    level: "info",
    data: {
      userId: user.id,
      email: maskEmail(email),
      hasTwoFactorEnabled:
        Boolean(user.settings?.speakeasy?.isEnabled) &&
        Boolean(user.settings?.speakeasy?.isVerified),
    },
  });
  setResponseStatus(event, 200);
  return { token, message: null, user: publicProfileSchema.parse(user) };
}

export default withErrorHandler(loginHandler);
