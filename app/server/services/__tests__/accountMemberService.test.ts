import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listAccountMembers,
  removeAccountMember,
  updateAccountMemberCapabilities,
} from "../accountMemberService";
import { prisma } from "~/server/clients/prismaClient";
import { assertUserCanAssignRegisterScopeForAccounts } from "~/server/services/accountInviteService";

// Mock H3/Nuxt utilities (createError must throw so statusCode assertions work;
// the setup-file h3 mock is not reliably applied to service module graphs)
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

const { PRISMA_JSON_NULL } = vi.hoisted(() => {
  // Workaround for a source bug: accountMemberService.ts imports `Prisma` as a
  // type-only import (erased at runtime) but references `Prisma.JsonNull` at
  // runtime. Tests stub the missing global so the JsonNull branches can run.
  const jsonNull = Symbol("Prisma.JsonNull");
  (globalThis as any).Prisma = { JsonNull: jsonNull };
  return { PRISMA_JSON_NULL: jsonNull };
});

// Mock server dependencies
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/services/accountInviteService", () => ({
  assertUserCanAssignRegisterScopeForAccounts: vi.fn(),
}));

const ACTOR_ID = 1;
const TARGET_ID = 7;
const ACCOUNT_ID = "acc-1";

function actorMembership(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    userId: ACTOR_ID,
    accountId: ACCOUNT_ID,
    canViewBudgets: true,
    canInviteUsers: true,
    canManageMembers: true,
    allowedBudgetIds: null,
    allowedAccountRegisterIds: null,
    ...overrides,
  };
}

/** prisma.userAccount.findFirst answers both the actor capability lookup
 * (getMembership) and the target member lookup based on the queried userId. */
function mockUserAccountFindFirst(
  opts: {
    actorMembership?: Record<string, unknown> | null;
    targetRow?: Record<string, unknown> | null;
  } = {},
) {
  (prisma.userAccount.findFirst as any).mockImplementation(
    async (args: any) => {
      if (args.where.userId === ACTOR_ID) {
        return opts.actorMembership === undefined
          ? actorMembership()
          : opts.actorMembership;
      }
      if (args.where.userId === TARGET_ID) {
        return opts.targetRow ?? null;
      }
      return null;
    },
  );
}

describe("accountMemberService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listAccountMembers", () => {
    it("rejects with 403 when the actor cannot invite users", async () => {
      mockUserAccountFindFirst({
        actorMembership: actorMembership({ canInviteUsers: false }),
      });

      await expect(
        listAccountMembers({ actorUserId: ACTOR_ID, accountId: ACCOUNT_ID }),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "HTTP 403: Forbidden",
      });
      expect(prisma.userAccount.findMany).not.toHaveBeenCalled();
    });

    it("rejects with 403 when the actor is not a member", async () => {
      mockUserAccountFindFirst({ actorMembership: null });

      await expect(
        listAccountMembers({ actorUserId: ACTOR_ID, accountId: ACCOUNT_ID }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("returns members mapped with parsed allowedAccountRegisterIds", async () => {
      mockUserAccountFindFirst();
      (prisma.userAccount.findMany as any).mockResolvedValue([
        {
          userId: TARGET_ID,
          canViewBudgets: true,
          canInviteUsers: false,
          canManageMembers: false,
          allowedBudgetIds: [3, 1],
          allowedAccountRegisterIds: [9, 9, 2],
          user: {
            id: TARGET_ID,
            email: "member@example.com",
            firstName: "Mem",
            lastName: "Ber",
          },
        },
      ]);

      const result = await listAccountMembers({
        actorUserId: ACTOR_ID,
        accountId: ACCOUNT_ID,
      });

      expect(prisma.userAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId: ACCOUNT_ID },
          orderBy: { userId: "asc" },
        }),
      );
      expect(result).toEqual([
        {
          userId: TARGET_ID,
          email: "member@example.com",
          firstName: "Mem",
          lastName: "Ber",
          canViewBudgets: true,
          canInviteUsers: false,
          canManageMembers: false,
          allowedBudgetIds: [3, 1],
          allowedAccountRegisterIds: [2, 9],
        },
      ]);
    });

    it("keeps null allowedAccountRegisterIds as null (all registers)", async () => {
      mockUserAccountFindFirst();
      (prisma.userAccount.findMany as any).mockResolvedValue([
        {
          userId: TARGET_ID,
          canViewBudgets: true,
          canInviteUsers: true,
          canManageMembers: true,
          allowedBudgetIds: null,
          allowedAccountRegisterIds: null,
          user: { id: TARGET_ID, email: "a@b.com", firstName: "A", lastName: "B" },
        },
      ]);

      const result = await listAccountMembers({
        actorUserId: ACTOR_ID,
        accountId: ACCOUNT_ID,
      });

      expect(result[0].allowedAccountRegisterIds).toBeNull();
      expect(result[0].allowedBudgetIds).toBeNull();
    });
  });

  describe("removeAccountMember", () => {
    it("rejects with 403 when the actor cannot manage members", async () => {
      mockUserAccountFindFirst({
        actorMembership: actorMembership({ canManageMembers: false }),
      });

      await expect(
        removeAccountMember({
          actorUserId: ACTOR_ID,
          accountId: ACCOUNT_ID,
          targetUserId: TARGET_ID,
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "HTTP 403: Forbidden",
      });
      expect(prisma.userAccount.delete).not.toHaveBeenCalled();
    });

    it("rejects with 404 when the target member does not exist", async () => {
      mockUserAccountFindFirst({ targetRow: null });

      await expect(
        removeAccountMember({
          actorUserId: ACTOR_ID,
          accountId: ACCOUNT_ID,
          targetUserId: TARGET_ID,
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "HTTP 404: Member not found",
      });
      expect(prisma.userAccount.delete).not.toHaveBeenCalled();
    });

    it("rejects with 400 when the target is the only member who can manage members", async () => {
      mockUserAccountFindFirst({ targetRow: { id: 55 } });
      (prisma.userAccount.findMany as any).mockResolvedValue([
        { userId: ACTOR_ID, canManageMembers: false },
        { userId: TARGET_ID, canManageMembers: true },
      ]);

      await expect(
        removeAccountMember({
          actorUserId: ACTOR_ID,
          accountId: ACCOUNT_ID,
          targetUserId: TARGET_ID,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message:
          "HTTP 400: Cannot remove the only member who can manage members for this account.",
      });
      expect(prisma.userAccount.delete).not.toHaveBeenCalled();
    });

    it("deletes the member's userAccount row and returns ok", async () => {
      mockUserAccountFindFirst({ targetRow: { id: 55 } });
      (prisma.userAccount.findMany as any).mockResolvedValue([
        { userId: ACTOR_ID, canManageMembers: true },
        { userId: TARGET_ID, canManageMembers: false },
      ]);
      (prisma.userAccount.delete as any).mockResolvedValue({ id: 55 });

      const result = await removeAccountMember({
        actorUserId: ACTOR_ID,
        accountId: ACCOUNT_ID,
        targetUserId: TARGET_ID,
      });

      expect(result).toEqual({ ok: true });
      expect(prisma.userAccount.delete).toHaveBeenCalledWith({
        where: { id: 55 },
      });
    });

    it("allows removing one of several managers", async () => {
      mockUserAccountFindFirst({ targetRow: { id: 55 } });
      (prisma.userAccount.findMany as any).mockResolvedValue([
        { userId: ACTOR_ID, canManageMembers: true },
        { userId: TARGET_ID, canManageMembers: true },
      ]);

      const result = await removeAccountMember({
        actorUserId: ACTOR_ID,
        accountId: ACCOUNT_ID,
        targetUserId: TARGET_ID,
      });

      expect(result).toEqual({ ok: true });
      expect(prisma.userAccount.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateAccountMemberCapabilities", () => {
    const fullPermissions = {
      canViewBudgets: true,
      canInviteUsers: false,
      canManageMembers: false,
      allowedBudgetIds: [2, 1],
      allowedAccountRegisterIds: [5, 5, 3],
    };

    it("rejects with 403 when the actor cannot manage members", async () => {
      mockUserAccountFindFirst({
        actorMembership: actorMembership({ canManageMembers: false }),
      });

      await expect(
        updateAccountMemberCapabilities({
          actorUserId: ACTOR_ID,
          accountId: ACCOUNT_ID,
          targetUserId: TARGET_ID,
          permissions: fullPermissions,
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "HTTP 403: Forbidden",
      });
      expect(prisma.userAccount.update).not.toHaveBeenCalled();
    });

    it("rejects with 404 when the target member does not exist", async () => {
      mockUserAccountFindFirst({ targetRow: null });

      await expect(
        updateAccountMemberCapabilities({
          actorUserId: ACTOR_ID,
          accountId: ACCOUNT_ID,
          targetUserId: TARGET_ID,
          permissions: fullPermissions,
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "HTTP 404: Member not found",
      });
    });

    it("rejects with 400 when demoting the only manager", async () => {
      mockUserAccountFindFirst({ targetRow: { id: 55 } });
      (prisma.userAccount.findMany as any).mockResolvedValue([
        { userId: ACTOR_ID, canManageMembers: false },
        { userId: TARGET_ID, canManageMembers: true },
      ]);

      await expect(
        updateAccountMemberCapabilities({
          actorUserId: ACTOR_ID,
          accountId: ACCOUNT_ID,
          targetUserId: TARGET_ID,
          permissions: fullPermissions,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.userAccount.update).not.toHaveBeenCalled();
    });

    it("allows demotion when another manager exists", async () => {
      mockUserAccountFindFirst({ targetRow: { id: 55 } });
      (prisma.userAccount.findMany as any).mockResolvedValue([
        { userId: ACTOR_ID, canManageMembers: true },
        { userId: TARGET_ID, canManageMembers: true },
      ]);
      (prisma.userAccount.update as any).mockResolvedValue({});

      const result = await updateAccountMemberCapabilities({
        actorUserId: ACTOR_ID,
        accountId: ACCOUNT_ID,
        targetUserId: TARGET_ID,
        permissions: fullPermissions,
      });

      expect(result).toEqual({ ok: true });
    });

    it("skips the last-manager guard when granting canManageMembers", async () => {
      mockUserAccountFindFirst({ targetRow: { id: 55 } });
      (prisma.userAccount.update as any).mockResolvedValue({});

      await updateAccountMemberCapabilities({
        actorUserId: ACTOR_ID,
        accountId: ACCOUNT_ID,
        targetUserId: TARGET_ID,
        permissions: {
          canViewBudgets: true,
          canInviteUsers: false,
          canManageMembers: true,
        },
      });

      expect(prisma.userAccount.findMany).not.toHaveBeenCalled();
      expect(prisma.userAccount.update).toHaveBeenCalledTimes(1);
    });

    it("updates capabilities, passes arrays through and validates register scope", async () => {
      mockUserAccountFindFirst({ targetRow: { id: 55 } });
      (prisma.userAccount.findMany as any).mockResolvedValue([
        { userId: ACTOR_ID, canManageMembers: true },
      ]);
      (prisma.userAccount.update as any).mockResolvedValue({});
      (
        assertUserCanAssignRegisterScopeForAccounts as any
      ).mockResolvedValue(undefined);

      await updateAccountMemberCapabilities({
        actorUserId: ACTOR_ID,
        accountId: ACCOUNT_ID,
        targetUserId: TARGET_ID,
        permissions: fullPermissions,
      });

      expect(assertUserCanAssignRegisterScopeForAccounts).toHaveBeenCalledWith(
        ACTOR_ID,
        [ACCOUNT_ID],
        [5, 5, 3],
      );
      expect(prisma.userAccount.update).toHaveBeenCalledWith({
        where: { id: 55 },
        data: {
          canViewBudgets: true,
          canInviteUsers: false,
          canManageMembers: false,
          allowedBudgetIds: [2, 1],
          allowedAccountRegisterIds: [5, 5, 3],
        },
      });
    });

    it("omits allowedBudgetIds/allowedAccountRegisterIds when undefined", async () => {
      mockUserAccountFindFirst({ targetRow: { id: 55 } });
      (prisma.userAccount.findMany as any).mockResolvedValue([
        { userId: ACTOR_ID, canManageMembers: true },
      ]);
      (prisma.userAccount.update as any).mockResolvedValue({});

      await updateAccountMemberCapabilities({
        actorUserId: ACTOR_ID,
        accountId: ACCOUNT_ID,
        targetUserId: TARGET_ID,
        permissions: {
          canViewBudgets: false,
          canInviteUsers: false,
          canManageMembers: true,
        },
      });

      const updateArgs = (prisma.userAccount.update as any).mock.calls[0][0];
      expect(updateArgs.data).toEqual({
        canViewBudgets: false,
        canInviteUsers: false,
        canManageMembers: true,
      });
      expect("allowedBudgetIds" in updateArgs.data).toBe(false);
      expect("allowedAccountRegisterIds" in updateArgs.data).toBe(false);
    });

    it("passes Prisma.JsonNull for null permission arrays", async () => {
      mockUserAccountFindFirst({ targetRow: { id: 55 } });
      (prisma.userAccount.findMany as any).mockResolvedValue([
        { userId: ACTOR_ID, canManageMembers: true },
      ]);
      (prisma.userAccount.update as any).mockResolvedValue({});

      await updateAccountMemberCapabilities({
        actorUserId: ACTOR_ID,
        accountId: ACCOUNT_ID,
        targetUserId: TARGET_ID,
        permissions: {
          canViewBudgets: true,
          canInviteUsers: false,
          canManageMembers: false,
          allowedBudgetIds: null,
          allowedAccountRegisterIds: null,
        },
      });

      const updateArgs = (prisma.userAccount.update as any).mock.calls[0][0];
      expect(updateArgs.data.allowedBudgetIds).toBe(PRISMA_JSON_NULL);
      expect(updateArgs.data.allowedAccountRegisterIds).toBe(PRISMA_JSON_NULL);
    });

    it("surfaces register-scope validation failures", async () => {
      mockUserAccountFindFirst({ targetRow: { id: 55 } });
      (prisma.userAccount.findMany as any).mockResolvedValue([
        { userId: ACTOR_ID, canManageMembers: true },
      ]);
      const scopeError = new Error(
        "HTTP 403: You cannot grant access to registers you cannot see yourself.",
      ) as any;
      scopeError.statusCode = 403;
      (
        assertUserCanAssignRegisterScopeForAccounts as any
      ).mockRejectedValue(scopeError);

      await expect(
        updateAccountMemberCapabilities({
          actorUserId: ACTOR_ID,
          accountId: ACCOUNT_ID,
          targetUserId: TARGET_ID,
          permissions: {
            ...fullPermissions,
            allowedAccountRegisterIds: [5],
          },
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(prisma.userAccount.update).not.toHaveBeenCalled();
    });
  });
});
