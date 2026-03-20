/**
 * Shape Prisma returns that satisfies `userProfileFromDbSchema` (via `sessionUserFromDb`).
 */
export function dbUserForSession(
  overrides: Partial<{
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    settings: Record<string, unknown>;
  }> = {},
) {
  return {
    id: 123,
    firstName: "Test",
    lastName: "User",
    email: "test@example.com",
    password: "hashedPassword",
    settings: {
      speakeasy: { isEnabled: false, isVerified: false },
      mfa: {
        totp: { isEnabled: false, isVerified: false },
        passkeys: [],
        emailOtp: { isEnabled: false, isVerified: false },
      },
      plaid: { isEnabled: false },
    },
    ...overrides,
  };
}
