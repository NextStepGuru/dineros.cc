import { describe, it, expect, vi, beforeEach } from "vitest";
import { dbUserForSession } from "./fixtures/dbUserForSession";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
});

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  readBody: vi.fn(),
  setResponseStatus: vi.fn(),
}));

(globalThis as any).readBody = vi.fn();

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("~/server/env", () => ({
  default: {
    DEPLOY_ENV: "local",
  },
}));

vi.mock("~/server/clients/postmarkClient", () => ({
  hasPostmarkToken: false,
  postmarkClient: {
    sendEmail: vi.fn(),
  },
}));

const mfaFns = vi.hoisted(() => ({
  getPendingMfaSession: vi.fn(),
  canSendEmailOtp: vi.fn(),
  generateNumericOtpCode: vi.fn(() => "999888"),
  hashOtp: vi.fn((x: string) => `hash(${x})`),
  storeEmailOtpForSession: vi.fn(),
  verifyEmailOtpForSession: vi.fn(),
  clearPendingMfaSession: vi.fn(),
  withUpdatedEmailOtp: vi.fn((settings: any, patch: any) => ({
    ...settings,
    mfa: { ...(settings?.mfa as object), emailOtp: patch },
  })),
}));

vi.mock("~/server/lib/mfa", () => mfaFns);

vi.mock("~/server/clients/prismaClient", () => ({
  prisma: {
    user: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(),
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/server/lib/completeLogin", () => ({
  completeLogin: vi.fn().mockResolvedValue({ ok: true, loggedIn: true }),
}));

vi.mock("~/schema/zod", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/schema/zod")>();
  return {
    ...actual,
    privateUserSchema: {
      parse: vi.fn((x: unknown) => x),
    },
    publicProfileSchema: actual.publicProfileSchema,
  };
});

describe("MFA email API", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { readBody, setResponseStatus } = await import("h3");
    (readBody as any).mockReset();
    (readBody as any).mockResolvedValue({});
    (setResponseStatus as any).mockReset();
    (globalThis as any).readBody = readBody;
    (globalThis as any).setResponseStatus = setResponseStatus;
  });

  describe("POST /api/mfa/email/send-code", () => {
    let handler: (event: unknown) => Promise<unknown>;

    beforeEach(async () => {
      const mod = await import("../mfa/email/send-code.post");
      handler = mod.default;
    });

    it("returns 401 when no pending session", async () => {
      mfaFns.getPendingMfaSession.mockResolvedValue(null);
      const { setResponseStatus } = await import("h3");

      const out = await handler({});

      expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 401);
      expect(out).toEqual({ errors: "No pending email OTP challenge found." });
    });

    it("logs OTP locally when no Postmark (local)", async () => {
      mfaFns.getPendingMfaSession.mockResolvedValue({
        id: "sess",
        userId: 1,
        email: "a@b.c",
        methods: ["email"],
      });
      mfaFns.canSendEmailOtp.mockResolvedValue(true);
      const { log } = await import("~/server/logger");

      const out = await handler({});

      expect(mfaFns.storeEmailOtpForSession).toHaveBeenCalled();
      expect(log).toHaveBeenCalled();
      expect(out).toEqual({ message: "Verification code sent." });
    });

    it("returns 429 when rate limited", async () => {
      mfaFns.getPendingMfaSession.mockResolvedValue({
        id: "sess",
        userId: 1,
        email: "a@b.c",
        methods: ["email"],
      });
      mfaFns.canSendEmailOtp.mockResolvedValue(false);
      const { setResponseStatus } = await import("h3");

      const out = await handler({});

      expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 429);
      expect(out).toMatchObject({
        errors: expect.stringContaining("Too many"),
      });
    });
  });

  describe("POST /api/mfa/email/toggle", () => {
    let handler: (event: unknown) => Promise<unknown>;

    beforeEach(async () => {
      const mod = await import("../mfa/email/toggle.post");
      handler = mod.default;
    });

    it("updates email OTP settings", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");

      (readBody as any).mockResolvedValue({ enabled: true });
      (globalThis as any).readBody.mockResolvedValue({ enabled: true });
      (getUser as any).mockReturnValue({ userId: 5 });
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue({
        id: 5,
        settings: {},
      });
      (prisma.user.update as any).mockResolvedValue(dbUserForSession({ id: 5 }));

      await handler({});

      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe("POST /api/mfa/email/verify", () => {
    let handler: (event: unknown) => Promise<unknown>;

    beforeEach(async () => {
      const mod = await import("../mfa/email/verify.post");
      handler = mod.default;
    });

    it("returns 401 when session missing", async () => {
      const { readBody } = await import("h3");
      (readBody as any).mockResolvedValue({ code: "123456" });
      (globalThis as any).readBody.mockResolvedValue({ code: "123456" });
      mfaFns.getPendingMfaSession.mockResolvedValue(null);
      const { setResponseStatus } = await import("h3");

      const out = await handler({});

      expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 401);
      expect(out).toEqual({ errors: "No pending email OTP challenge found." });
    });

    it("completes login when code valid", async () => {
      const { readBody } = await import("h3");
      const { completeLogin } = await import("~/server/lib/completeLogin");

      (readBody as any).mockResolvedValue({ code: "123456" });
      (globalThis as any).readBody.mockResolvedValue({ code: "123456" });
      mfaFns.getPendingMfaSession.mockResolvedValue({
        id: "sess",
        userId: 9,
        methods: ["email"],
      });
      mfaFns.verifyEmailOtpForSession.mockResolvedValue(true);

      const out = await handler({});

      expect(completeLogin).toHaveBeenCalled();
      expect(out).toEqual({ ok: true, loggedIn: true });
    });
  });
});
