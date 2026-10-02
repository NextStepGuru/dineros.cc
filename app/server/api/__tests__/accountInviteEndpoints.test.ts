import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  // Make defineEventHandler available globally before any imports
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
});

// Mock H3/Nuxt utilities before any imports
vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  createError: vi.fn((error) => {
    const statusCode = error.statusCode || 500;
    const message = error.statusMessage || error.message || "Unknown error";
    const fullMessage = `HTTP ${statusCode}: ${message}`;
    const err = new Error(fullMessage) as any;
    err.statusCode = statusCode;
    err.statusMessage = message;
    throw err;
  }),
  readBody: vi.fn(),
  getQuery: vi.fn(),
  setResponseStatus: vi.fn(),
  getRouterParam: vi.fn(),
}));

// Make H3 functions globally available
(globalThis as any).readBody = vi.fn();
(globalThis as any).getQuery = vi.fn();
(globalThis as any).getRouterParam = vi.fn();

// Mock server dependencies
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(),
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/server/services/accountInviteService", () => ({
  createAccountInvite: vi.fn(),
  listPendingInvitesForAccount: vi.fn(),
  revokeAccountInvite: vi.fn(),
  getInviteValidationPayload: vi.fn(),
  acceptAccountInvite: vi.fn(),
}));

describe("Account Invite API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-create global mock functions after vi.clearAllMocks()
    (globalThis as any).readBody = vi.fn();
    (globalThis as any).getQuery = vi.fn();
    (globalThis as any).getRouterParam = vi.fn();
  });

  describe("GET /api/account-invite", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../account-invite.get");
      handler = module.default;
    });

    it("lists pending invites for the authenticated user's account", async () => {
      const mockEvent = {};
      const pending = [
        { id: 31, email: "pending@example.com", inviteAccounts: [] },
      ];

      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { listPendingInvitesForAccount } = await import(
        "~/server/services/accountInviteService"
      );

      (getQuery as any).mockReturnValue({ accountId: "acc-1" });
      (getUser as any).mockReturnValue({ userId: 123 });
      (listPendingInvitesForAccount as any).mockResolvedValue(pending);

      const result = await handler(mockEvent);

      expect(result).toEqual(pending);
      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(listPendingInvitesForAccount).toHaveBeenCalledWith({
        userId: 123,
        accountId: "acc-1",
      });
    });

    it("rejects a query without accountId via zod and reports to handleApiError", async () => {
      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { listPendingInvitesForAccount } = await import(
        "~/server/services/accountInviteService"
      );

      (getQuery as any).mockReturnValue({});
      (getUser as any).mockReturnValue({ userId: 123 });

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(listPendingInvitesForAccount).not.toHaveBeenCalled();
    });

    it("propagates service errors", async () => {
      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { listPendingInvitesForAccount } = await import(
        "~/server/services/accountInviteService"
      );

      const forbidden = new Error("HTTP 403: Forbidden") as any;
      forbidden.statusCode = 403;
      (getQuery as any).mockReturnValue({ accountId: "acc-1" });
      (getUser as any).mockReturnValue({ userId: 123 });
      (listPendingInvitesForAccount as any).mockRejectedValue(forbidden);

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(403);
      expect(handleApiError).toHaveBeenCalledWith(forbidden);
    });
  });

  describe("POST /api/account-invite", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../account-invite.post");
      handler = module.default;
    });

    const validBody = {
      accountIds: ["acc-1"],
      email: "Friend@Example.com",
      permissions: {
        canViewBudgets: true,
        canInviteUsers: false,
        canManageMembers: false,
        allowedBudgetIds: null,
        allowedAccountRegisterIds: [4],
      },
    };

    it("creates an invite from the parsed body", async () => {
      const mockEvent = {};
      const created = { id: 10, email: "friend@example.com" };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { createAccountInvite } = await import(
        "~/server/services/accountInviteService"
      );

      (readBody as any).mockResolvedValue(validBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (createAccountInvite as any).mockResolvedValue(created);

      const result = await handler(mockEvent);

      expect(result).toEqual(created);
      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(createAccountInvite).toHaveBeenCalledWith({
        inviterUserId: 123,
        accountIds: ["acc-1"],
        email: "Friend@Example.com",
        permissions: validBody.permissions,
      });
    });

    it("rejects an invalid email and never calls the service", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { createAccountInvite } = await import(
        "~/server/services/accountInviteService"
      );

      (readBody as any).mockResolvedValue({ ...validBody, email: "nope" });
      (getUser as any).mockReturnValue({ userId: 123 });

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(createAccountInvite).not.toHaveBeenCalled();
    });

    it("rejects unknown body keys (strict schema)", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { createAccountInvite } = await import(
        "~/server/services/accountInviteService"
      );

      (readBody as any).mockResolvedValue({
        ...validBody,
        unexpected: true,
      });
      (getUser as any).mockReturnValue({ userId: 123 });

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(createAccountInvite).not.toHaveBeenCalled();
    });

    it("rejects a body without permissions", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      const { permissions: _omitted, ...bodyWithoutPermissions } = validBody;
      (readBody as any).mockResolvedValue(bodyWithoutPermissions);
      (getUser as any).mockReturnValue({ userId: 123 });

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
    });

    it("propagates service rejections", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { createAccountInvite } = await import(
        "~/server/services/accountInviteService"
      );

      const conflict = new Error("HTTP 409: Conflict") as any;
      conflict.statusCode = 409;
      (readBody as any).mockResolvedValue(validBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (createAccountInvite as any).mockRejectedValue(conflict);

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(409);
      expect(handleApiError).toHaveBeenCalledWith(conflict);
    });
  });

  describe("DELETE /api/account-invite/[id]", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../account-invite/[id].delete");
      handler = module.default;
    });

    it("revokes the invite for the authenticated user", async () => {
      const mockEvent = {};
      const revoked = { ok: true };

      const { getRouterParam } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { revokeAccountInvite } = await import(
        "~/server/services/accountInviteService"
      );

      (getRouterParam as any).mockImplementation(
        (_event: any, name: string) => (name === "id" ? "12" : undefined),
      );
      (getUser as any).mockReturnValue({ userId: 123 });
      (revokeAccountInvite as any).mockResolvedValue(revoked);

      const result = await handler(mockEvent);

      expect(result).toEqual(revoked);
      expect(revokeAccountInvite).toHaveBeenCalledWith({
        userId: 123,
        inviteId: 12,
      });
    });

    it("rejects a non-numeric invite id with 400", async () => {
      const { getRouterParam } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { revokeAccountInvite } = await import(
        "~/server/services/accountInviteService"
      );

      (getRouterParam as any).mockReturnValue("abc");
      (getUser as any).mockReturnValue({ userId: 123 });

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(400);
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(revokeAccountInvite).not.toHaveBeenCalled();
    });

    it("rejects an invite id below 1 with 400", async () => {
      const { getRouterParam } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getRouterParam as any).mockReturnValue("0");
      (getUser as any).mockReturnValue({ userId: 123 });

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(400);
      expect(handleApiError).toHaveBeenCalledTimes(1);
    });

    it("rejects a missing invite id with 400", async () => {
      const { getRouterParam } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getRouterParam as any).mockReturnValue(undefined);
      (getUser as any).mockReturnValue({ userId: 123 });

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(400);
      expect(handleApiError).toHaveBeenCalledTimes(1);
    });

    it("propagates service rejections", async () => {
      const { getRouterParam } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { revokeAccountInvite } = await import(
        "~/server/services/accountInviteService"
      );

      const notFound = new Error("HTTP 404: Invite not found") as any;
      notFound.statusCode = 404;
      (getRouterParam as any).mockReturnValue("12");
      (getUser as any).mockReturnValue({ userId: 123 });
      (revokeAccountInvite as any).mockRejectedValue(notFound);

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(404);
      expect(handleApiError).toHaveBeenCalledWith(notFound);
    });
  });

  describe("POST /api/account-invite/accept", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../account-invite/accept.post");
      handler = module.default;
    });

    it("passes the parsed body and event to acceptAccountInvite", async () => {
      const mockEvent = { node: { req: {} } };
      const body = {
        token: "tok",
        firstName: "New",
        lastName: "User",
        password: "secret123",
        confirmPassword: "secret123",
      };
      const accepted = { token: "jwt-token", message: null, user: { id: 42 } };

      const { readBody } = await import("h3");
      const { acceptAccountInvite } = await import(
        "~/server/services/accountInviteService"
      );

      (readBody as any).mockResolvedValue(body);
      (acceptAccountInvite as any).mockResolvedValue(accepted);

      const result = await handler(mockEvent);

      expect(result).toEqual(accepted);
      expect(acceptAccountInvite).toHaveBeenCalledWith(mockEvent, body);
    });

    it("allows optional fields to be omitted", async () => {
      const { readBody } = await import("h3");
      const { acceptAccountInvite } = await import(
        "~/server/services/accountInviteService"
      );

      (readBody as any).mockResolvedValue({ token: "tok" });
      (acceptAccountInvite as any).mockResolvedValue({ token: "jwt" });

      await handler({});

      expect(acceptAccountInvite).toHaveBeenCalledWith(expect.anything(), {
        token: "tok",
      });
    });

    it("rejects a body without a token and never calls the service", async () => {
      const { readBody } = await import("h3");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { acceptAccountInvite } = await import(
        "~/server/services/accountInviteService"
      );

      (readBody as any).mockResolvedValue({ firstName: "New" });

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(acceptAccountInvite).not.toHaveBeenCalled();
    });

    it("propagates service rejections (e.g. expired invite)", async () => {
      const { readBody } = await import("h3");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { acceptAccountInvite } = await import(
        "~/server/services/accountInviteService"
      );

      const invalid = new Error("HTTP 400: Invalid or expired invite") as any;
      invalid.statusCode = 400;
      (readBody as any).mockResolvedValue({ token: "tok" });
      (acceptAccountInvite as any).mockRejectedValue(invalid);

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(400);
      expect(handleApiError).toHaveBeenCalledWith(invalid);
    });
  });

  describe("GET /api/account-invite/validate", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../account-invite/validate.get");
      handler = module.default;
    });

    it("is auth-exempt: resolves the token without any user lookup", async () => {
      const mockEvent = {};
      const payload = {
        valid: true,
        accounts: [{ id: "acc-1", name: "Acc One" }],
        accountName: "Acc One",
        inviterDisplayName: "Jane Doe",
        expiresAt: "2024-02-01T00:00:00.000Z",
        needsPassword: true,
        needsName: true,
        permissions: {
          canViewBudgets: true,
          canInviteUsers: false,
          canManageMembers: false,
          allowedBudgetIds: null,
          allowedAccountRegisterIds: null,
        },
      };

      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { getInviteValidationPayload } = await import(
        "~/server/services/accountInviteService"
      );

      (getQuery as any).mockReturnValue({ token: "tok" });
      (getInviteValidationPayload as any).mockResolvedValue(payload);

      const result = await handler(mockEvent);

      expect(result).toEqual(payload);
      expect(getInviteValidationPayload).toHaveBeenCalledWith("tok");
      expect(getUser).not.toHaveBeenCalled();
    });

    it("passes through an invalid-token payload", async () => {
      const { getQuery } = await import("h3");
      const { getInviteValidationPayload } = await import(
        "~/server/services/accountInviteService"
      );

      (getQuery as any).mockReturnValue({ token: "junk" });
      (getInviteValidationPayload as any).mockResolvedValue({ valid: false });

      const result = await handler({});

      expect(result).toEqual({ valid: false });
    });

    it("rejects a query without a token", async () => {
      const { getQuery } = await import("h3");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { getInviteValidationPayload } = await import(
        "~/server/services/accountInviteService"
      );

      (getQuery as any).mockReturnValue({});

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(getInviteValidationPayload).not.toHaveBeenCalled();
    });

    it("propagates service rejections", async () => {
      const { getQuery } = await import("h3");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { getInviteValidationPayload } = await import(
        "~/server/services/accountInviteService"
      );

      const boom = new Error("HTTP 500: Boom") as any;
      boom.statusCode = 500;
      (getQuery as any).mockReturnValue({ token: "tok" });
      (getInviteValidationPayload as any).mockRejectedValue(boom);

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(500);
      expect(handleApiError).toHaveBeenCalledWith(boom);
    });
  });
});
