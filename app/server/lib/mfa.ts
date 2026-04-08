import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie } from "h3";
import { sharedRedisConnection } from "~/server/clients/redisClient";
import env from "~/server/env";
import { getConfiguredAppBaseUrl } from "~/server/lib/appUrl";
import { dateTimeService } from "~/server/services/forecast/DateTimeService";

export const PENDING_MFA_COOKIE = "pendingMfaSession";
const PENDING_MFA_TTL_SECONDS = 10 * 60;
const EMAIL_OTP_TTL_SECONDS = 10 * 60;
const EMAIL_OTP_MAX_SENDS_PER_HOUR = 5;

export type MfaMethod = "totp" | "passkey" | "email";

export type PendingMfaSession = {
  id: string;
  userId: number;
  email: string;
  methods: MfaMethod[];
  createdAt: string;
};

type TotpSettings = {
  isEnabled: boolean;
  isVerified: boolean;
  base32secret?: string;
  backupCodes?: string[];
};

type MfaSettings = {
  totp: TotpSettings;
  passkeys: Array<{
    id: string;
    publicKey: string;
    counter: number;
    transports?: string[];
    name?: string;
    createdAt?: string;
  }>;
  emailOtp: {
    isEnabled: boolean;
    isVerified: boolean;
  };
};

const DEFAULT_MFA_SETTINGS: MfaSettings = {
  totp: { isEnabled: false, isVerified: false },
  passkeys: [],
  emailOtp: { isEnabled: false, isVerified: false },
};

function toMfaSettings(settings: Record<string, any>): MfaSettings {
  const mfa = settings?.mfa;
  if (!mfa || typeof mfa !== "object" || Array.isArray(mfa)) {
    return DEFAULT_MFA_SETTINGS;
  }
  return {
    totp:
      mfa.totp && typeof mfa.totp === "object" && !Array.isArray(mfa.totp)
        ? {
            isEnabled: Boolean(mfa.totp.isEnabled),
            isVerified: Boolean(mfa.totp.isVerified),
            ...(typeof mfa.totp.base32secret === "string"
              ? { base32secret: mfa.totp.base32secret }
              : {}),
            ...(Array.isArray(mfa.totp.backupCodes)
              ? { backupCodes: mfa.totp.backupCodes }
              : {}),
          }
        : DEFAULT_MFA_SETTINGS.totp,
    passkeys: Array.isArray(mfa.passkeys) ? mfa.passkeys : [],
    emailOtp:
      mfa.emailOtp &&
      typeof mfa.emailOtp === "object" &&
      !Array.isArray(mfa.emailOtp)
        ? {
            isEnabled: Boolean(mfa.emailOtp.isEnabled),
            isVerified: Boolean(mfa.emailOtp.isVerified),
          }
        : DEFAULT_MFA_SETTINGS.emailOtp,
  };
}

export function getEnabledMfaMethods(
  settings: Record<string, any>,
): MfaMethod[] {
  const mfa = toMfaSettings(settings);
  const methods: MfaMethod[] = [];

  if (mfa.totp?.isEnabled && mfa.totp?.isVerified && mfa.totp?.base32secret) {
    methods.push("totp");
  }

  if (Array.isArray(mfa.passkeys) && mfa.passkeys.length > 0) {
    methods.push("passkey");
  }

  if (mfa.emailOtp?.isEnabled) {
    methods.push("email");
  }

  return methods;
}

export function withUpdatedTotp(
  settings: Record<string, any>,
  totp: Partial<TotpSettings>,
) {
  const current = toMfaSettings(settings).totp;
  const next = {
    ...current,
    ...totp,
  };

  return {
    ...settings,
    speakeasy: {
      ...settings.speakeasy,
      isEnabled: Boolean(next.isEnabled),
      isVerified: Boolean(next.isVerified),
      ...(typeof next.base32secret === "string"
        ? { base32secret: next.base32secret }
        : {}),
      ...(Array.isArray(next.backupCodes)
        ? { backupCodes: next.backupCodes }
        : {}),
    },
    mfa: {
      ...toMfaSettings(settings),
      totp: next,
    },
  };
}

export function withUpdatedEmailOtp(
  settings: Record<string, any>,
  emailOtp: Partial<MfaSettings["emailOtp"]>,
) {
  return {
    ...settings,
    mfa: {
      ...toMfaSettings(settings),
      emailOtp: {
        ...toMfaSettings(settings).emailOtp,
        ...emailOtp,
      },
    },
  };
}

export function withUpdatedPasskeys(
  settings: Record<string, any>,
  passkeys: MfaSettings["passkeys"],
) {
  return {
    ...settings,
    mfa: {
      ...toMfaSettings(settings),
      passkeys,
    },
  };
}

function pendingMfaRedisKey(sessionId: string) {
  return `mfa:pending:${sessionId}`;
}

function emailOtpRedisKey(sessionId: string) {
  return `mfa:emailotp:${sessionId}`;
}

function emailOtpRateLimitRedisKey(userId: number) {
  return `mfa:emailotp:ratelimit:${userId}`;
}

export async function createPendingMfaSession(
  event: any,
  data: Omit<PendingMfaSession, "id" | "createdAt">,
) {
  const sessionId = randomBytes(24).toString("hex");
  const session: PendingMfaSession = {
    id: sessionId,
    userId: data.userId,
    email: data.email,
    methods: data.methods,
    createdAt: dateTimeService.toISOString(),
  };

  await sharedRedisConnection.setex(
    pendingMfaRedisKey(sessionId),
    PENDING_MFA_TTL_SECONDS,
    JSON.stringify(session),
  );

  setCookie(event, PENDING_MFA_COOKIE, sessionId, {
    secure: env?.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: PENDING_MFA_TTL_SECONDS,
    path: "/",
  });

  return session;
}

export async function getPendingMfaSession(event: any) {
  const sessionId = getCookie(event, PENDING_MFA_COOKIE);
  if (!sessionId) {
    return null;
  }

  const raw = await sharedRedisConnection.get(pendingMfaRedisKey(sessionId));
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw) as PendingMfaSession;
  return parsed;
}

export async function clearPendingMfaSession(event: any) {
  const sessionId = getCookie(event, PENDING_MFA_COOKIE);
  if (sessionId) {
    await sharedRedisConnection.del(
      pendingMfaRedisKey(sessionId),
      emailOtpRedisKey(sessionId),
      `mfa:passkey:auth:${sessionId}`,
    );
  }

  setCookie(event, PENDING_MFA_COOKIE, "", {
    secure: env?.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

export function generateNumericOtpCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

export function hashOtp(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function canSendEmailOtp(userId: number) {
  const key = emailOtpRateLimitRedisKey(userId);
  const count = await sharedRedisConnection.incr(key);
  if (count === 1) {
    await sharedRedisConnection.expire(key, 60 * 60);
  }
  return count <= EMAIL_OTP_MAX_SENDS_PER_HOUR;
}

export async function storeEmailOtpForSession(
  sessionId: string,
  codeHash: string,
) {
  await sharedRedisConnection.setex(
    emailOtpRedisKey(sessionId),
    EMAIL_OTP_TTL_SECONDS,
    codeHash,
  );
}

export async function verifyEmailOtpForSession(
  sessionId: string,
  code: string,
) {
  const key = emailOtpRedisKey(sessionId);
  const expectedHash = await sharedRedisConnection.get(key);
  if (!expectedHash) {
    return false;
  }

  const computed = hashOtp(code.trim());
  const matches =
    expectedHash.length === computed.length &&
    timingSafeEqual(Buffer.from(expectedHash, "utf8"), Buffer.from(computed, "utf8"));
  if (matches) {
    await sharedRedisConnection.del(key);
  }
  return matches;
}

const EMAIL_OTP_VERIFY_MAX_ATTEMPTS = 5;

/** Increment failed verify attempts; invalidates OTP after too many failures. */
export async function recordEmailOtpVerifyFailure(
  sessionId: string,
): Promise<"ok" | "locked"> {
  if (process.env.NODE_ENV === "test") {
    return "ok";
  }
  const key = `mfa:email:verify:fail:${sessionId}`;
  const count = await sharedRedisConnection.incr(key);
  if (count === 1) {
    await sharedRedisConnection.expire(key, EMAIL_OTP_TTL_SECONDS);
  }
  if (count > EMAIL_OTP_VERIFY_MAX_ATTEMPTS) {
    await sharedRedisConnection.del(emailOtpRedisKey(sessionId));
    return "locked";
  }
  return "ok";
}

export function getWebAuthnConfig() {
  const origin = getConfiguredAppBaseUrl();
  if (!origin) {
    throw new Error(
      "NUXT_PUBLIC_SITE_URL is required for WebAuthn in non-local environments.",
    );
  }
  const rpID = env?.WEBAUTHN_RP_ID || new URL(origin).hostname;
  const rpName = env?.WEBAUTHN_RP_NAME || "Dineros.cc";

  return { rpID, rpName, origin };
}
