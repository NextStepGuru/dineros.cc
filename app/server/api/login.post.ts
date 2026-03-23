import { verify } from "otplib";
import { createHash } from "node:crypto";
import { readBody, setResponseStatus } from "h3";
import { z } from "zod";
import { loginSchema, privateUserSchema } from "~/schema/zod";
import env from "../env";
import HashService from "../services/HashService";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { withErrorHandler } from "~/server/lib/withErrorHandler";
import { log } from "~/server/logger";
import {
  clearPendingMfaSession,
  createPendingMfaSession,
  getEnabledMfaMethods,
  withUpdatedTotp,
  type MfaMethod,
} from "~/server/lib/mfa";
import { completeLogin } from "~/server/lib/completeLogin";
import type { User } from "@prisma/client";

type PrivateUser = z.infer<typeof privateUserSchema>;

const INVISIBLE_EMAIL_CHARS = /[\u200B-\u200D\uFEFF]/g;

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || !local) return "invalid-email-format";
  return `${local.slice(0, 2)}***@${domain}`;
}

function normalizeLoginBody(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return body;
  const b = body as Record<string, unknown>;
  if (typeof b.email !== "string") return body;
  return {
    ...b,
    email: b.email.replaceAll(INVISIBLE_EMAIL_CHARS, "").trim(),
  };
}

function buildLoginDebugData(): Record<string, unknown> | undefined {
  if (process.env.LOGIN_DEBUG !== "1") return undefined;
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
      ? (env?.DB_DECRYPTION_KEYS.length ?? 0)
      : 0,
    decryptionKeyFingerprints: Array.isArray(env?.DB_DECRYPTION_KEYS)
      ? env?.DB_DECRYPTION_KEYS?.map((k: string) =>
          createHash("sha256").update(k).digest("hex").slice(0, 8),
        )
      : [],
    processEnvDecryptionKeysRawLen: (process.env.DB_DECRYPTION_KEYS ?? "")
      .length,
    processEnvDecryptionKeysContainsComma: (
      process.env.DB_DECRYPTION_KEYS ?? ""
    ).includes(","),
  };
}

function logLoginAttempt(
  email: string,
  tokenChallenge: string | undefined,
  loginDebugData: ReturnType<typeof buildLoginDebugData>,
) {
  const data: Record<string, unknown> = {
    email: maskEmail(email),
    hasTokenChallenge: Boolean(tokenChallenge),
  };
  if (loginDebugData) {
    Object.assign(data, loginDebugData);
  }
  log({
    message: "[LOGIN][EMAIL] Login attempt received",
    level: "info",
    data,
  });
}

async function findUserForLogin(
  email: string,
  lowerCaseEmail: string,
): Promise<User | null> {
  const hashedEmail = createHash("sha512").update(email, "utf8").digest("hex");
  const lowerCaseHashedEmail =
    lowerCaseEmail === email
      ? hashedEmail
      : createHash("sha512").update(lowerCaseEmail, "utf8").digest("hex");

  let lookup = await PrismaDb.user.findUnique({
    where: { email },
  });

  if (!lookup) {
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

  return lookup;
}

type MfaFlowResult =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

async function runMfaFlow(
  event: any,
  user: PrivateUser,
  email: string,
  tokenChallenge: string | undefined,
  mfaMethods: MfaMethod[],
): Promise<MfaFlowResult> {
  if (mfaMethods.length === 0) {
    return { ok: true };
  }

  if (!tokenChallenge) {
    await createPendingMfaSession(event, {
      userId: user.id,
      email,
      methods: mfaMethods,
    });

    log({
      message: "[LOGIN][EMAIL] MFA challenge required",
      level: "info",
      data: {
        userId: user.id,
        email: maskEmail(email),
        methods: mfaMethods,
      },
    });
    return {
      ok: false,
      status: 200,
      body: { twoFactorChallengeRequired: true, mfaMethods },
    };
  }

  if (!mfaMethods.includes("totp")) {
    return {
      ok: false,
      status: 401,
      body: { errors: "Use an available two-factor method for this account." },
    };
  }

  const backupCodes = user.settings.mfa.totp.backupCodes || [];
  const isBackupCode = backupCodes.includes(tokenChallenge);

  let verificationResult = false;

  if (isBackupCode) {
    const updatedBackupCodes = backupCodes.filter(
      (code) => code !== tokenChallenge,
    );

    await PrismaDb.user.update({
      where: { id: user.id },
      data: {
        settings: structuredClone(
          withUpdatedTotp(user.settings, {
            backupCodes: updatedBackupCodes,
          }),
        ),
      },
    });

    verificationResult = true;
  } else {
    const totpSecret = user.settings.mfa.totp.base32secret;
    if (!totpSecret) {
      return {
        ok: false,
        status: 401,
        body: { errors: "Invalid two-factor authentication token." },
      };
    }
    const totpResult = await verify({
      secret: totpSecret,
      token: tokenChallenge,
      epochTolerance: 300,
    });
    verificationResult = totpResult.valid;
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
    return {
      ok: false,
      status: 401,
      body: { errors: "Invalid two-factor authentication token." },
    };
  }

  return { ok: true };
}

async function loginHandler(event: any) {
  const body = await readBody(event);
  const normalizedBody = normalizeLoginBody(body);
  const parsed = loginSchema
    .extend({ tokenChallenge: z.string().optional() })
    .parse(normalizedBody);
  const email = parsed.email.trim();
  const password = parsed.password;
  const tokenChallenge = parsed.tokenChallenge;
  const lowerCaseEmail = email.toLowerCase();

  const loginDebugData = buildLoginDebugData();
  logLoginAttempt(email, tokenChallenge, loginDebugData);

  const lookup = await findUserForLogin(email, lowerCaseEmail);

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

  const user = privateUserSchema.parse({ ...lookup, email });

  if (!user?.password) {
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

  const mfaMethods = getEnabledMfaMethods(user.settings);
  const mfaResult = await runMfaFlow(
    event,
    user,
    email,
    tokenChallenge,
    mfaMethods,
  );

  if (!mfaResult.ok) {
    setResponseStatus(event, mfaResult.status);
    return mfaResult.body;
  }

  await clearPendingMfaSession(event);
  const loginResult = await completeLogin(event, user.id);
  log({
    message: "[LOGIN][EMAIL] Login successful",
    level: "info",
    data: {
      userId: user.id,
      email: maskEmail(email),
      hasTwoFactorEnabled: mfaMethods.length > 0,
    },
  });
  setResponseStatus(event, 200);
  return loginResult;
}

export default withErrorHandler(loginHandler);
