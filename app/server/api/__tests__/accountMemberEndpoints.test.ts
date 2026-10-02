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

vi.mock("~/server/services/accountMemberService", () => ({
  listAccountMembers: vi.fn(),
  removeAccountMember: vi.fn(),
  updateAccountMemberCapabilities: vi.fn(),
}));

describe("Account Member API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-create global mock functions after vi.clearAllMocks()
    (globalThis as any).readBody = vi.fn();
    (globalThis as any).getQuery = vi.fn();
    (globalThis as any).getRouterParam = vi.fn();
  });

  describe("GET /api/account/[accountId]/members", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../account/[accountId]/members.get");
      handler = module.default;
    });

    it("lists members of the account for the authenticated user", async () => {
      const mockEvent = {};
      const members = [
        {
          userId: 7,
          email: "member@example.com",
          firstName: "Mem",
          lastName: "Ber",
          canViewBudgets: true,
          canInviteUsers: false,
          canManageMembers: false,
          allowedBudgetIds: null,
          allowedAccountRegisterIds: [2, 9],
        },
      ];

      const { getRouterParam } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { listAccountMembers } = await import(
        "~/server/services/accountMemberService"
      );

      (getRouterParam as any).mockReturnValue("acc-1");
      (getUser as any).mockReturnValue({ userId: 123 });
      (listAccountMembers as any).mockResolvedValue(members);

      const result = await handler(mockEvent);

      expect(result).toEqual(members);
      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(getRouterParam).toHaveBeenCalledWith(mockEvent, "accountId");
      expect(listAccountMembers).toHaveBeenCalledWith({
        actorUserId: 123,
        accountId: "acc-1",
      });
    });

    it("rejects with 400 when the accountId route param is missing", async () => {
      const { getRouterParam } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { listAccountMembers } = await import(
        "~/server/services/accountMemberService"
      );

      (getRouterParam as any).mockReturnValue(undefined);
      (getUser as any).mockReturnValue({ userId: 123 });

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain("Missing account id");
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(listAccountMembers).not.toHaveBeenCalled();
    });

    it("propagates service rejections", async () => {
      const { getRouterParam } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { listAccountMembers } = await import(
        "~/server/services/accountMemberService"
      );

      const forbidden = new Error("HTTP 403: Forbidden") as any;
      forbidden.statusCode = 403;
      (getRouterParam as any).mockReturnValue("acc-1");
      (getUser as any).mockReturnValue({ userId: 123 });
      (listAccountMembers as any).mockRejectedValue(forbidden);

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(403);
      expect(handleApiError).toHaveBeenCalledWith(forbidden);
    });
  });

  describe("DELETE /api/account/[accountId]/members/[userId]", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import(
        "../account/[accountId]/members/[userId].delete"
      );
      handler = module.default;
    });

    it("removes the member via the service with parsed ids", async () => {
      const mockEvent = {};
      const removed = { ok: true };

      const { getRouterParam } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { removeAccountMember } = await import(
        "~/server/services/accountMemberService"
      );

      (getRouterParam as any).mockImplementation(
        (_event: any, name: string) =>
          ({ accountId: "acc-1", userId: "7" })[name as "accountId"],
      );
      (getUser as any).mockReturnValue({ userId: 123 });
      (removeAccountMember as any).mockResolvedValue(removed);

      const result = await handler(mockEvent);

      expect(result).toEqual(removed);
      expect(removeAccountMember).toHaveBeenCalledWith({
        actorUserId: 123,
        accountId: "acc-1",
        targetUserId: 7,
      });
    });

    it("rejects with 400 when route params are missing", async () => {
      const { getRouterParam } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { removeAccountMember } = await import(
        "~/server/services/accountMemberService"
      );

      (getRouterParam as any).mockReturnValue(undefined);
      (getUser as any).mockReturnValue({ userId: 123 });

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain("Missing account or user id");
      expect(removeAccountMember).not.toHaveBeenCalled();
    });

    it("rejects with 400 for a non-numeric userId", async () => {
      const { getRouterParam } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { removeAccountMember } = await import(
        "~/server/services/accountMemberService"
      );

      (getRouterParam as any).mockImplementation(
        (_event: any, name: string) =>
          ({ accountId: "acc-1", userId: "abc" })[name as "accountId"],
      );
      (getUser as any).mockReturnValue({ userId: 123 });

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain("Invalid user id");
      expect(removeAccountMember).not.toHaveBeenCalled();
    });

    it("rejects with 400 for a userId below 1", async () => {
      const { getRouterParam } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getRouterParam as any).mockImplementation(
        (_event: any, name: string) =>
          ({ accountId: "acc-1", userId: "0" })[name as "accountId"],
      );
      (getUser as any).mockReturnValue({ userId: 123 });

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(400);
      expect(handleApiError).toHaveBeenCalledTimes(1);
    });

    it("propagates service rejections", async () => {
      const { getRouterParam } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { removeAccountMember } = await import(
        "~/server/services/accountMemberService"
      );

      const notFound = new Error("HTTP 404: Member not found") as any;
      notFound.statusCode = 404;
      (getRouterParam as any).mockImplementation(
        (_event: any, name: string) =>
          ({ accountId: "acc-1", userId: "7" })[name as "accountId"],
      );
      (getUser as any).mockReturnValue({ userId: 123 });
      (removeAccountMember as any).mockRejectedValue(notFound);

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(404);
      expect(handleApiError).toHaveBeenCalledWith(notFound);
    });
  });

  describe("PATCH /api/account/[accountId]/members/[userId]", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import(
        "../account/[accountId]/members/[userId].patch"
      );
      handler = module.default;
    });

    const validPermissions = {
      canViewBudgets: true,
      canInviteUsers: false,
      canManageMembers: false,
      allowedBudgetIds: [1, 2],
      allowedAccountRegisterIds: null,
    };

    it("updates member capabilities from the parsed body", async () => {
      const mockEvent = {};
      const updated = { ok: true };

      const { getRouterParam, readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { updateAccountMemberCapabilities } = await import(
        "~/server/services/accountMemberService"
      );

      (getRouterParam as any).mockImplementation(
        (_event: any, name: string) =>
          ({ accountId: "acc-1", userId: "7" })[name as "accountId"],
      );
      (readBody as any).mockResolvedValue(validPermissions);
      (getUser as any).mockReturnValue({ userId: 123 });
      (updateAccountMemberCapabilities as any).mockResolvedValue(updated);

      const result = await handler(mockEvent);

      expect(result).toEqual(updated);
      expect(updateAccountMemberCapabilities).toHaveBeenCalledWith({
        actorUserId: 123,
        accountId: "acc-1",
        targetUserId: 7,
        permissions: validPermissions,
      });
    });

    it("strips unknown keys from the permissions body", async () => {
      const { getRouterParam, readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { updateAccountMemberCapabilities } = await import(
        "~/server/services/accountMemberService"
      );

      (getRouterParam as any).mockImplementation(
        (_event: any, name: string) =>
          ({ accountId: "acc-1", userId: "7" })[name as "accountId"],
      );
      (readBody as any).mockResolvedValue({
        ...validPermissions,
        isAdmin: true,
      });
      (getUser as any).mockReturnValue({ userId: 123 });
      (updateAccountMemberCapabilities as any).mockResolvedValue({ ok: true });

      await handler({});

      expect(updateAccountMemberCapabilities).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: validPermissions,
        }),
      );
    });

    it("rejects an invalid permissions body and never calls the service", async () => {
      const { getRouterParam, readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { updateAccountMemberCapabilities } = await import(
        "~/server/services/accountMemberService"
      );

      (getRouterParam as any).mockImplementation(
        (_event: any, name: string) =>
          ({ accountId: "acc-1", userId: "7" })[name as "accountId"],
      );
      (readBody as any).mockResolvedValue({
        canInviteUsers: "not-a-boolean",
      });
      (getUser as any).mockReturnValue({ userId: 123 });

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(updateAccountMemberCapabilities).not.toHaveBeenCalled();
    });

    it("rejects a negative allowedBudgetIds entry", async () => {
      const { getRouterParam, readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getRouterParam as any).mockImplementation(
        (_event: any, name: string) =>
          ({ accountId: "acc-1", userId: "7" })[name as "accountId"],
      );
      (readBody as any).mockResolvedValue({
        ...validPermissions,
        allowedBudgetIds: [-1],
      });
      (getUser as any).mockReturnValue({ userId: 123 });

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
    });

    it("rejects with 400 when route params are missing", async () => {
      const { getRouterParam } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getRouterParam as any).mockReturnValue(undefined);
      (getUser as any).mockReturnValue({ userId: 123 });

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain("Missing account or user id");
      expect(handleApiError).toHaveBeenCalledTimes(1);
    });

    it("rejects with 400 for an invalid userId before reading the body", async () => {
      const { getRouterParam, readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { updateAccountMemberCapabilities } = await import(
        "~/server/services/accountMemberService"
      );

      (getRouterParam as any).mockImplementation(
        (_event: any, name: string) =>
          ({ accountId: "acc-1", userId: "abc" })[name as "accountId"],
      );
      (getUser as any).mockReturnValue({ userId: 123 });

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain("Invalid user id");
      expect(readBody).not.toHaveBeenCalled();
      expect(updateAccountMemberCapabilities).not.toHaveBeenCalled();
      expect(handleApiError).toHaveBeenCalledTimes(1);
    });

    it("propagates service rejections", async () => {
      const { getRouterParam, readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { updateAccountMemberCapabilities } = await import(
        "~/server/services/accountMemberService"
      );

      const badRequest = new Error("HTTP 400: Bad request") as any;
      badRequest.statusCode = 400;
      (getRouterParam as any).mockImplementation(
        (_event: any, name: string) =>
          ({ accountId: "acc-1", userId: "7" })[name as "accountId"],
      );
      (readBody as any).mockResolvedValue(validPermissions);
      (getUser as any).mockReturnValue({ userId: 123 });
      (updateAccountMemberCapabilities as any).mockRejectedValue(badRequest);

      const err = await handler({}).catch((e: any) => e);
      expect(err.statusCode).toBe(400);
      expect(handleApiError).toHaveBeenCalledWith(badRequest);
    });
  });
});
