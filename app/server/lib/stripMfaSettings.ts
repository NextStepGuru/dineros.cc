import type { Prisma } from "@prisma/client";

/** Forces user to re-enroll MFA after password reset via email. */
export function stripMfaFromUserSettings(
  settings: unknown,
): Prisma.InputJsonValue {
  const s =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  return {
    ...s,
    speakeasy: { isEnabled: false, isVerified: false },
    mfa: {
      totp: { isEnabled: false, isVerified: false },
      passkeys: [],
      emailOtp: { isEnabled: false, isVerified: false },
    },
  } as Prisma.InputJsonValue;
}
