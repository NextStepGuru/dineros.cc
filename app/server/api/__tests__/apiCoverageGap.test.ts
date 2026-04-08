import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~/server/clients/prismaClient";
import { dbUserForSession } from "./fixtures/dbUserForSession";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
});

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  createError: vi.fn(
    (error: {
      statusCode?: number;
      statusMessage?: string;
      message?: string;
    }) => {
      const statusCode = error.statusCode || 500;
      const message = error.statusMessage || error.message || "Unknown error";
      const err = new Error(`HTTP ${statusCode}: ${message}`) as Error & {
        statusCode?: number;
        statusMessage?: string;
      };
      err.statusCode = statusCode;
      err.statusMessage = message;
      throw err;
    },
  ),
  readBody: vi.fn(),
  getQuery: vi.fn(),
  getRouterParam: vi.fn(),
  setResponseStatus: vi.fn(),
}));

(globalThis as any).readBody = vi.fn();
(globalThis as any).getQuery = vi.fn();
(globalThis as any).getRouterParam = vi.fn();
(globalThis as any).setResponseStatus = vi.fn();

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/server/lib/requireAdmin", () => ({
  requireAdmin: vi.fn().mockResolvedValue(undefined),
}));

const redisMock = vi.hoisted(() => ({
  setex: vi.fn().mockResolvedValue("OK"),
  get: vi.fn(),
  del: vi.fn().mockResolvedValue(1),
}));

vi.mock("~/server/clients/redisClient", () => ({
  sharedRedisConnection: redisMock,
}));

const verifyAuthResp = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    verified: true,
    authenticationInfo: { newCounter: 42 },
  }),
);

const verifyRegResp = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: {
        id: "new-cred-id",
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
      },
    },
  }),
);

vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: vi.fn().mockResolvedValue({
    challenge: "auth-challenge",
    allowCredentials: [],
  }),
  generateRegistrationOptions: vi.fn().mockResolvedValue({
    challenge: "reg-challenge",
  }),
  verifyAuthenticationResponse: verifyAuthResp,
  verifyRegistrationResponse: verifyRegResp,
}));

const otplibVerify = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ valid: true }),
);

vi.mock("otplib", () => ({
  verify: otplibVerify,
}));

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/clients/queuesClient", () => ({
  addRecalculateJob: vi.fn(),
}));

const { gapHashVerify } = vi.hoisted(() => ({
  gapHashVerify: vi.fn().mockResolvedValue(true),
}));
vi.mock("~/server/services/HashService", () => ({
  default: vi.fn().mockImplementation(() => ({
    verify: gapHashVerify,
  })),
}));

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn().mockReturnValue({ userId: 123 }),
}));

const mfaGapFns = vi.hoisted(() => ({
  getPendingMfaSession: vi.fn(),
  getWebAuthnConfig: vi.fn().mockReturnValue({
    rpID: "localhost",
    rpName: "Test",
    origin: "http://localhost:3000",
  }),
  withUpdatedPasskeys: vi.fn((settings: any, passkeys: unknown[]) => ({
    ...settings,
    mfa: { ...settings.mfa, passkeys },
  })),
  withUpdatedTotp: vi.fn((settings: any, patch: any) => ({
    ...settings,
    mfa: { ...settings.mfa, totp: { ...settings.mfa?.totp, ...patch } },
  })),
  clearPendingMfaSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/server/lib/mfa", () => mfaGapFns);

vi.mock("~/server/lib/completeLogin", () => ({
  completeLogin: vi.fn().mockResolvedValue({ ok: true, loggedIn: true }),
}));

vi.mock("~/schema/zod", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/schema/zod")>();
  return {
    ...actual,
    privateUserSchema: {
      parse: (x: unknown) => x,
    },
    publicProfileSchema: {
      parse: (x: unknown) => x,
    },
    savingsGoalSchema: {
      parse: (x: unknown) => x,
    },
    updateSavingsGoalSchema: actual.updateSavingsGoalSchema,
  };
});

async function resetH3() {
  const { readBody, getQuery, getRouterParam, setResponseStatus } =
    await import("h3");
  (readBody as any).mockReset();
  (readBody as any).mockResolvedValue({});
  (getQuery as any).mockReset();
  (getRouterParam as any).mockReset();
  (setResponseStatus as any).mockReset();
  (globalThis as any).readBody = readBody;
  (globalThis as any).getQuery = getQuery;
  (globalThis as any).getRouterParam = getRouterParam;
  (globalThis as any).setResponseStatus = setResponseStatus;
}

describe("API coverage gap (forecast-balances, admin, MFA passkey/totp, savings-goal)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetH3();
    redisMock.get.mockReset();
    redisMock.setex.mockResolvedValue("OK");
    redisMock.del.mockResolvedValue(1);
    otplibVerify.mockResolvedValue({ valid: true });
    verifyAuthResp.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 42 },
    });
    verifyRegResp.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: "new-cred-id",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
      },
    });
    mfaGapFns.getPendingMfaSession.mockReset();
    mfaGapFns.getWebAuthnConfig.mockReturnValue({
      rpID: "localhost",
      rpName: "Test",
      origin: "http://localhost:3000",
    });
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (_tx: typeof prisma) => Promise<unknown>)(
          prisma,
        );
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg.map((op) => op));
      }
      return undefined;
    });
  });

  describe("GET /api/account-registers/forecast-balances", () => {
    it("returns empty balances when no registers", async () => {
      const { getQuery } = await import("h3");
      (getQuery as any).mockReturnValue({
        accountId: "acc-1",
        budgetId: "1",
        monthsAhead: "0",
      });
      prisma.budget.findFirst.mockResolvedValue({ id: 1 });
      prisma.userAccount.findFirst.mockResolvedValue({
        accountId: "acc-1",
      });
      prisma.accountRegister.findMany.mockResolvedValue([]);

      const mod = await import("../account-registers/forecast-balances.get");
      const handler = mod.default;
      const out = await handler({} as never);
      expect(out).toMatchObject({
        asOf: expect.any(String),
        balances: {},
      });
    });

    it("returns forecast balances for registers", async () => {
      const { getQuery } = await import("h3");
      (getQuery as any).mockReturnValue({
        accountId: "acc-1",
        budgetId: "1",
        monthsAhead: "0",
      });
      prisma.budget.findFirst.mockResolvedValue({ id: 1 });
      prisma.userAccount.findFirst.mockResolvedValue({
        accountId: "acc-1",
      });
      prisma.accountRegister.findMany.mockResolvedValue([
        {
          id: 10,
          balance: 0,
          latestBalance: 100,
          subAccountRegisterId: null,
          type: { isCredit: false },
        },
      ]);
      prisma.registerEntry.findMany.mockResolvedValue([]);

      const mod = await import("../account-registers/forecast-balances.get");
      const handler = mod.default;
      const out = await handler({} as never);
      expect(out).toMatchObject({
        asOf: expect.any(String),
        balances: { 10: expect.any(Number) },
      });
    });

    it("403 when budget missing", async () => {
      const { getQuery } = await import("h3");
      (getQuery as any).mockReturnValue({
        accountId: "acc-1",
        budgetId: "99",
        monthsAhead: "0",
      });
      prisma.budget.findFirst.mockResolvedValue(null);

      const mod = await import("../account-registers/forecast-balances.get");
      const handler = mod.default;
      await expect(handler({} as never)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("403 when account not linked to user", async () => {
      const { getQuery } = await import("h3");
      (getQuery as any).mockReturnValue({
        accountId: "acc-x",
        budgetId: "1",
        monthsAhead: "0",
      });
      prisma.budget.findFirst.mockResolvedValue({ id: 1 });
      prisma.userAccount.findFirst.mockResolvedValue(null);

      const mod = await import("../account-registers/forecast-balances.get");
      const handler = mod.default;
      await expect(handler({} as never)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe("GET /api/admin/openai-request-logs", () => {
    it("returns paginated logs", async () => {
      const { getQuery } = await import("h3");
      (getQuery as any).mockReturnValue({ limit: "10", offset: "0" });
      prisma.openAiRequestLog.findMany.mockResolvedValue([{ id: 1 }]);
      prisma.openAiRequestLog.count.mockResolvedValue(1);

      const mod = await import("../admin/openai-request-logs.get");
      const out = await mod.default({} as never);
      expect(out).toEqual({
        items: [{ id: 1 }],
        total: 1,
        limit: 10,
        offset: 0,
      });
    });
  });

  describe("POST /api/mfa/passkey/delete", () => {
    it("removes passkey and returns profile", async () => {
      const { readBody } = await import("h3");
      gapHashVerify.mockResolvedValue(true);
      (readBody as any).mockResolvedValue({
        id: "pk-1",
        currentPassword: "fixture-password",
      });
      const userRow = dbUserForSession({
        settings: {
          speakeasy: { isEnabled: false, isVerified: false },
          mfa: {
            totp: { isEnabled: false, isVerified: false },
            passkeys: [{ id: "pk-1", publicKey: "abc", counter: 0 }],
            emailOtp: { isEnabled: false, isVerified: false },
          },
          plaid: { isEnabled: false },
        },
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue(userRow);
      type SessionSettings = {
        speakeasy: { isEnabled: boolean; isVerified: boolean };
        mfa: {
          totp: { isEnabled: boolean; isVerified: boolean };
          passkeys: unknown[];
          emailOtp: { isEnabled: boolean; isVerified: boolean };
        };
        plaid: { isEnabled: boolean };
      };
      const settings = userRow.settings as SessionSettings;
      prisma.user.update.mockResolvedValue({
        ...userRow,
        settings: {
          ...settings,
          mfa: { ...settings.mfa, passkeys: [] },
        },
      });

      const mod = await import("../mfa/passkey/delete.post");
      await mod.default({} as never);
      expect(gapHashVerify).toHaveBeenCalledWith(
        "hashedPassword",
        "fixture-password",
      );
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe("POST /api/mfa/passkey/auth-options", () => {
    it("returns auth options when passkey MFA pending", async () => {
      mfaGapFns.getPendingMfaSession.mockResolvedValue({
        id: "sess-1",
        userId: 123,
        methods: ["passkey"],
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        dbUserForSession(),
      );

      const mod = await import("../mfa/passkey/auth-options.post");
      const out = await mod.default({} as never);
      expect(out).toMatchObject({ challenge: "auth-challenge" });
      expect(redisMock.setex).toHaveBeenCalled();
    });

    it("401 when no pending passkey session", async () => {
      const { setResponseStatus } = await import("h3");
      mfaGapFns.getPendingMfaSession.mockResolvedValue(null);

      const mod = await import("../mfa/passkey/auth-options.post");
      const out = await mod.default({} as never);
      expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 401);
      expect(out).toEqual({ errors: "No pending passkey challenge found." });
    });
  });

  describe("POST /api/mfa/passkey/register-options", () => {
    it("returns registration options", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        dbUserForSession(),
      );

      const mod = await import("../mfa/passkey/register-options.post");
      const out = await mod.default({} as never);
      expect(out).toMatchObject({ challenge: "reg-challenge" });
      expect(redisMock.setex).toHaveBeenCalled();
    });
  });

  describe("POST /api/mfa/passkey/register-verify", () => {
    it("401 when redis challenge missing", async () => {
      const { readBody, setResponseStatus } = await import("h3");
      (readBody as any).mockResolvedValue({ response: {} });
      redisMock.get.mockResolvedValue(null);
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        dbUserForSession(),
      );

      const mod = await import("../mfa/passkey/register-verify.post");
      const out = await mod.default({} as never);
      expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 401);
      expect(out).toEqual({
        errors: "No pending passkey registration challenge found.",
      });
    });

    it("adds new credential when verified", async () => {
      const { readBody } = await import("h3");
      (readBody as any).mockResolvedValue({
        response: { response: { transports: ["usb"] } },
      });
      redisMock.get.mockResolvedValue("reg-challenge");
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        dbUserForSession(),
      );
      prisma.user.update.mockResolvedValue(dbUserForSession());

      const mod = await import("../mfa/passkey/register-verify.post");
      await mod.default({} as never);
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it("401 when registration verification fails", async () => {
      const { readBody, setResponseStatus } = await import("h3");
      (readBody as any).mockResolvedValue({ response: {} });
      redisMock.get.mockResolvedValue("reg-challenge");
      verifyRegResp.mockResolvedValueOnce({
        verified: false,
        registrationInfo: undefined,
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        dbUserForSession(),
      );

      const mod = await import("../mfa/passkey/register-verify.post");
      const out = await mod.default({} as never);
      expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 401);
      expect(out).toEqual({
        errors: "Passkey registration verification failed.",
      });
    });

    it("returns profile when credential already registered", async () => {
      const { readBody } = await import("h3");
      (readBody as any).mockResolvedValue({
        response: { id: "dup-cred", response: { transports: [] } },
      });
      redisMock.get.mockResolvedValue("reg-challenge");
      verifyRegResp.mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          credential: {
            id: "dup-cred",
            publicKey: new Uint8Array([9]),
            counter: 0,
          },
        },
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        dbUserForSession({
          settings: {
            speakeasy: { isEnabled: false, isVerified: false },
            mfa: {
              totp: { isEnabled: false, isVerified: false },
              passkeys: [{ id: "dup-cred", publicKey: "CQk", counter: 0 }],
              emailOtp: { isEnabled: false, isVerified: false },
            },
            plaid: { isEnabled: false },
          },
        }),
      );

      const mod = await import("../mfa/passkey/register-verify.post");
      await mod.default({} as never);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/mfa/passkey/verify", () => {
    it("completes login on successful verification", async () => {
      const { readBody } = await import("h3");
      (readBody as any).mockResolvedValue({ response: { id: "pk-a" } });
      mfaGapFns.getPendingMfaSession.mockResolvedValue({
        id: "sess-1",
        userId: 123,
        methods: ["passkey"],
      });
      redisMock.get.mockResolvedValue("stored-challenge");
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        dbUserForSession({
          settings: {
            speakeasy: { isEnabled: false, isVerified: false },
            mfa: {
              totp: { isEnabled: false, isVerified: false },
              passkeys: [
                {
                  id: "pk-a",
                  publicKey: "AQID",
                  counter: 0,
                  transports: ["usb"],
                },
              ],
              emailOtp: { isEnabled: false, isVerified: false },
            },
            plaid: { isEnabled: false },
          },
        }),
      );
      prisma.user.update.mockResolvedValue(dbUserForSession());

      const mod = await import("../mfa/passkey/verify.post");
      const out = await mod.default({} as never);
      expect(out).toEqual({ ok: true, loggedIn: true });
      expect(redisMock.del).toHaveBeenCalled();
    });

    it("401 when auth challenge expired (redis)", async () => {
      const { readBody, setResponseStatus } = await import("h3");
      (readBody as any).mockResolvedValue({ response: { id: "pk-a" } });
      mfaGapFns.getPendingMfaSession.mockResolvedValue({
        id: "sess-1",
        userId: 123,
        methods: ["passkey"],
      });
      redisMock.get.mockResolvedValue(null);

      const mod = await import("../mfa/passkey/verify.post");
      const out = await mod.default({} as never);
      expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 401);
      expect(out).toEqual({ errors: "Passkey challenge has expired." });
    });

    it("401 when passkey id not registered for user", async () => {
      const { readBody, setResponseStatus } = await import("h3");
      (readBody as any).mockResolvedValue({ response: { id: "unknown-pk" } });
      mfaGapFns.getPendingMfaSession.mockResolvedValue({
        id: "sess-1",
        userId: 123,
        methods: ["passkey"],
      });
      redisMock.get.mockResolvedValue("stored-challenge");
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        dbUserForSession({
          settings: {
            speakeasy: { isEnabled: false, isVerified: false },
            mfa: {
              totp: { isEnabled: false, isVerified: false },
              passkeys: [{ id: "pk-a", publicKey: "AQID", counter: 0 }],
              emailOtp: { isEnabled: false, isVerified: false },
            },
            plaid: { isEnabled: false },
          },
        }),
      );

      const mod = await import("../mfa/passkey/verify.post");
      const out = await mod.default({} as never);
      expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 401);
      expect(out).toEqual({
        errors: "Passkey is not registered for this account.",
      });
    });

    it("401 when WebAuthn verification fails", async () => {
      const { readBody, setResponseStatus } = await import("h3");
      (readBody as any).mockResolvedValue({ response: { id: "pk-a" } });
      verifyAuthResp.mockResolvedValue({
        verified: false,
        authenticationInfo: { newCounter: 0 },
      });
      mfaGapFns.getPendingMfaSession.mockResolvedValue({
        id: "sess-1",
        userId: 123,
        methods: ["passkey"],
      });
      redisMock.get.mockResolvedValue("stored-challenge");
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        dbUserForSession({
          settings: {
            speakeasy: { isEnabled: false, isVerified: false },
            mfa: {
              totp: { isEnabled: false, isVerified: false },
              passkeys: [
                {
                  id: "pk-a",
                  publicKey: "AQID",
                  counter: 0,
                  transports: ["usb"],
                },
              ],
              emailOtp: { isEnabled: false, isVerified: false },
            },
            plaid: { isEnabled: false },
          },
        }),
      );

      const mod = await import("../mfa/passkey/verify.post");
      const out = await mod.default({} as never);
      expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 401);
      expect(out).toEqual({ errors: "Passkey verification failed." });
    });
  });

  describe("POST /api/mfa/totp/verify", () => {
    it("401 when no pending totp session", async () => {
      const { readBody, setResponseStatus } = await import("h3");
      (readBody as any).mockResolvedValue({ token: "123456" });
      mfaGapFns.getPendingMfaSession.mockResolvedValue(null);

      const mod = await import("../mfa/totp/verify.post");
      const out = await mod.default({} as never);
      expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 401);
      expect(out).toEqual({ errors: "No pending TOTP challenge found." });
    });

    it("completes login when token valid", async () => {
      const { readBody } = await import("h3");
      (readBody as any).mockResolvedValue({ token: "123456" });
      otplibVerify.mockResolvedValue({ valid: true });
      mfaGapFns.getPendingMfaSession.mockResolvedValue({
        id: "sess-1",
        userId: 123,
        methods: ["totp"],
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        dbUserForSession({
          settings: {
            speakeasy: { isEnabled: false, isVerified: false },
            mfa: {
              totp: {
                isEnabled: true,
                isVerified: true,
                base32secret: "SECRETBASE32",
                backupCodes: [],
              },
              passkeys: [],
              emailOtp: { isEnabled: false, isVerified: false },
            },
            plaid: { isEnabled: false },
          },
        }),
      );

      const mod = await import("../mfa/totp/verify.post");
      const out = await mod.default({} as never);
      expect(out).toEqual({ ok: true, loggedIn: true });
    });

    it("401 when TOTP secret not configured", async () => {
      const { readBody, setResponseStatus } = await import("h3");
      (readBody as any).mockResolvedValue({ token: "123456" });
      mfaGapFns.getPendingMfaSession.mockResolvedValue({
        id: "sess-1",
        userId: 123,
        methods: ["totp"],
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        dbUserForSession({
          settings: {
            speakeasy: { isEnabled: false, isVerified: false },
            mfa: {
              totp: {
                isEnabled: true,
                isVerified: true,
                backupCodes: [],
              },
              passkeys: [],
              emailOtp: { isEnabled: false, isVerified: false },
            },
            plaid: { isEnabled: false },
          },
        }),
      );

      const mod = await import("../mfa/totp/verify.post");
      const out = await mod.default({} as never);
      expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 401);
      expect(out).toEqual({ errors: "TOTP is not configured for this user." });
    });

    it("accepts backup code and consumes it", async () => {
      const { readBody } = await import("h3");
      (readBody as any).mockResolvedValue({ token: "BACKUP-ONLY-ONCE" });
      mfaGapFns.getPendingMfaSession.mockResolvedValue({
        id: "sess-1",
        userId: 123,
        methods: ["totp"],
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        dbUserForSession({
          settings: {
            speakeasy: { isEnabled: false, isVerified: false },
            mfa: {
              totp: {
                isEnabled: true,
                isVerified: true,
                base32secret: "SECRETBASE32",
                backupCodes: ["BACKUP-ONLY-ONCE"],
              },
              passkeys: [],
              emailOtp: { isEnabled: false, isVerified: false },
            },
            plaid: { isEnabled: false },
          },
        }),
      );
      prisma.user.update.mockResolvedValue(dbUserForSession());

      const mod = await import("../mfa/totp/verify.post");
      const out = await mod.default({} as never);
      expect(prisma.user.update).toHaveBeenCalled();
      expect(out).toEqual({ ok: true, loggedIn: true });
    });

    it("401 when OTP verify invalid", async () => {
      const { readBody, setResponseStatus } = await import("h3");
      (readBody as any).mockResolvedValue({ token: "000000" });
      otplibVerify.mockResolvedValue({ valid: false });
      mfaGapFns.getPendingMfaSession.mockResolvedValue({
        id: "sess-1",
        userId: 123,
        methods: ["totp"],
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue(
        dbUserForSession({
          settings: {
            speakeasy: { isEnabled: false, isVerified: false },
            mfa: {
              totp: {
                isEnabled: true,
                isVerified: true,
                base32secret: "SECRETBASE32",
                backupCodes: [],
              },
              passkeys: [],
              emailOtp: { isEnabled: false, isVerified: false },
            },
            plaid: { isEnabled: false },
          },
        }),
      );

      const mod = await import("../mfa/totp/verify.post");
      const out = await mod.default({} as never);
      expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 401);
      expect(out).toEqual({
        errors: "Invalid two-factor authentication token.",
      });
    });
  });

  describe("PATCH /api/savings-goal/[id]", () => {
    it("updates goal", async () => {
      const { readBody, getRouterParam } = await import("h3");
      (getRouterParam as any).mockReturnValue("5");
      (readBody as any).mockResolvedValue({ name: "Trip" });
      prisma.savingsGoal.findFirst.mockResolvedValue({
        id: 5,
        budgetId: 1,
        accountId: "acc-1",
      });
      prisma.savingsGoal.update.mockResolvedValue({
        id: 5,
        accountId: "acc-1",
        budgetId: 1,
        name: "Trip",
        targetAmount: 100,
        sourceAccountRegisterId: null,
        targetAccountRegisterId: null,
        priorityOverDebt: false,
        ignoreMinBalance: false,
        sortOrder: 0,
        isArchived: false,
      });

      const mod = await import("../savings-goal/[id].patch");
      await mod.default({} as never);
      expect(prisma.savingsGoal.update).toHaveBeenCalled();
    });

    it("400 when id invalid", async () => {
      const { getRouterParam } = await import("h3");
      (getRouterParam as any).mockReturnValue("not-a-number");

      const mod = await import("../savings-goal/[id].patch");
      await expect(mod.default({} as never)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("404 when goal missing", async () => {
      const { readBody, getRouterParam } = await import("h3");
      (getRouterParam as any).mockReturnValue("99");
      (readBody as any).mockResolvedValue({ name: "X" });
      prisma.savingsGoal.findFirst.mockResolvedValue(null);

      const mod = await import("../savings-goal/[id].patch");
      await expect(mod.default({} as never)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("400 when source register not in budget", async () => {
      const { readBody, getRouterParam } = await import("h3");
      (getRouterParam as any).mockReturnValue("5");
      (readBody as any).mockResolvedValue({ sourceAccountRegisterId: 999 });
      prisma.savingsGoal.findFirst.mockResolvedValue({
        id: 5,
        budgetId: 1,
        accountId: "acc-1",
      });
      prisma.accountRegister.findFirst.mockResolvedValue(null);

      const mod = await import("../savings-goal/[id].patch");
      await expect(mod.default({} as never)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe("PATCH /api/savings-goal/order", () => {
    it("reorders goals and enqueues recalc", async () => {
      const { readBody } = await import("h3");
      (readBody as any).mockResolvedValue({ goalIds: [1, 2] });
      prisma.savingsGoal.findMany.mockResolvedValue([
        { id: 1, accountId: "acc-1" },
        { id: 2, accountId: "acc-1" },
      ]);

      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");
      const mod = await import("../savings-goal/order.patch");
      await mod.default({} as never);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(addRecalculateJob).toHaveBeenCalledWith({ accountId: "acc-1" });
    });

    it("returns success when goalIds empty", async () => {
      const { readBody } = await import("h3");
      (readBody as any).mockResolvedValue({ goalIds: [] });

      const mod = await import("../savings-goal/order.patch");
      const out = await mod.default({} as never);
      expect(out).toEqual({ success: true });
    });

    it("400 when a goal id is missing or not accessible", async () => {
      const { readBody } = await import("h3");
      (readBody as any).mockResolvedValue({ goalIds: [1, 2] });
      prisma.savingsGoal.findMany.mockResolvedValue([
        { id: 1, accountId: "acc-1" },
      ]);

      const mod = await import("../savings-goal/order.patch");
      await expect(mod.default({} as never)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });
});
