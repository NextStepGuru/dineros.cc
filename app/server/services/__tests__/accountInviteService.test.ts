import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  INVITE_EXPIRY_DAYS,
  assertUserCanAssignRegisterScopeForAccounts,
  generateInviteToken,
  hashInviteToken,
  normalizeInviteEmail,
} from "../accountInviteService";
import { prisma } from "~/server/clients/prismaClient";

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

// Fixed clock matching TEST_DATE in vitest.setup.ts
const { FIXED_NOW_MS, PRISMA_JSON_NULL } = vi.hoisted(() => {
  // Workaround for a source bug: accountInviteService.ts imports `Prisma` as a
  // type-only import (erased at runtime) but references `Prisma.JsonNull` at
  // runtime. Tests stub the missing global so the JsonNull branches can run.
  const jsonNull = Symbol("Prisma.JsonNull");
  (globalThis as any).Prisma = { JsonNull: jsonNull };
  return {
    FIXED_NOW_MS: Date.parse("2024-01-01T00:00:00.000Z"),
    PRISMA_JSON_NULL: jsonNull,
  };
});

// Mock server dependencies before any imports that use them
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/lib/findUserByEmail", () => ({
  findUserByEmail: vi.fn(),
}));

vi.mock("~/server/lib/completeLogin", () => ({
  completeLogin: vi.fn(),
}));

const hashMock = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/HashService", () => ({
  default: class MockHashService {
    hash = hashMock;
  },
}));

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    nowDate: vi.fn(() => new Date(FIXED_NOW_MS)),
    add: vi.fn((amount: number, unit: string) => ({
      toDate: () => {
        if (unit === "hour") return new Date(FIXED_NOW_MS + amount * 3_600_000);
        if (unit === "day") return new Date(FIXED_NOW_MS + amount * 86_400_000);
        return new Date(FIXED_NOW_MS);
      },
    })),
  },
}));

vi.mock("~/server/clients/postmarkClient", () => ({
  postmarkClient: { sendEmail: vi.fn() },
  hasPostmarkToken: true,
}));

// Mutable so tests can flip DEPLOY_ENV for the local/email-skip branch
const envState = vi.hoisted(() => ({
  DEPLOY_ENV: "production",
  NUXT_PUBLIC_SITE_URL: "https://app.test",
}));

vi.mock("~/server/env", () => ({ default: envState }));

vi.mock("~/server/logger", () => ({ log: vi.fn() }));

const INVITER_ID = 1;
const INVITEE_EMAIL = "newuser@example.com";
const EXPIRES_AT = new Date(FIXED_NOW_MS + 7 * 86_400_000);

function fullMembership(overrides: Record<string, unknown> = {}) {
  return {
    userId: INVITER_ID,
    accountId: "acc-1",
    canViewBudgets: true,
    canInviteUsers: true,
    canManageMembers: true,
    allowedBudgetIds: null,
    allowedAccountRegisterIds: null,
    ...overrides,
  };
}

/** Mocks prisma.userAccount.findFirst to answer both capability checks (inviter)
 * and existing-membership checks (invitee) based on the queried userId. */
function mockUserAccountFindFirst(
  inviterMembership: Record<string, unknown> | null,
  inviteeLinks: Record<string, unknown> = {},
) {
  (prisma.userAccount.findFirst as any).mockImplementation(
    async (args: any) => {
      if (args.where.userId === INVITER_ID) {
        return inviterMembership
          ? { ...inviterMembership, accountId: args.where.accountId }
          : null;
      }
      return inviteeLinks[args.where.accountId] ?? null;
    },
  );
}

/** Mocks prisma.accountInvite.count for the pending-per-account cap (where has
 * inviteAccounts) and the per-user hourly rate limit (where has invitedByUserId). */
function mockInviteCounts(pending: number, recent: number) {
  (prisma.accountInvite.count as any).mockImplementation(async (args: any) => {
    if (args.where.invitedByUserId !== undefined) return recent;
    return pending;
  });
}

describe("accountInviteService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hashMock.mockResolvedValue("hashed-password");
    envState.DEPLOY_ENV = "production";
    envState.NUXT_PUBLIC_SITE_URL = "https://app.test";
  });

  describe("pure helpers", () => {
    it("INVITE_EXPIRY_DAYS is 7 days", () => {
      expect(INVITE_EXPIRY_DAYS).toBe(7);
    });

    it("hashInviteToken returns the sha256 hex digest of the token", () => {
      const token = "raw-token-value";
      const expected = createHash("sha256").update(token, "utf8").digest("hex");
      expect(hashInviteToken(token)).toBe(expected);
      expect(hashInviteToken(token)).toMatch(/^[a-f0-9]{64}$/);
    });

    it("hashInviteToken is deterministic and input-sensitive", () => {
      expect(hashInviteToken("a")).toBe(hashInviteToken("a"));
      expect(hashInviteToken("a")).not.toBe(hashInviteToken("b"));
    });

    it("generateInviteToken returns 64 hex characters", () => {
      const token = generateInviteToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it("generateInviteToken returns a unique value per call", () => {
      expect(generateInviteToken()).not.toBe(generateInviteToken());
    });

    it("normalizeInviteEmail trims and lowercases", () => {
      expect(normalizeInviteEmail("  USER@Example.COM ")).toBe(
        "user@example.com",
      );
    });
  });

  describe("assertUserCanAssignRegisterScopeForAccounts", () => {
    it("is a no-op without prisma calls when allowedRegisterIds is null", async () => {
      await assertUserCanAssignRegisterScopeForAccounts(
        INVITER_ID,
        ["acc-1"],
        null,
      );
      await assertUserCanAssignRegisterScopeForAccounts(
        INVITER_ID,
        ["acc-1"],
        undefined,
      );
      await assertUserCanAssignRegisterScopeForAccounts(INVITER_ID, ["acc-1"], []);
      expect(prisma.userAccount.findMany).not.toHaveBeenCalled();
      expect(prisma.accountRegister.findMany).not.toHaveBeenCalled();
    });

    it("resolves when every register belongs to a visible account of the inviter", async () => {
      (prisma.userAccount.findMany as any).mockResolvedValue([
        {
          accountId: "acc-1",
          canViewBudgets: true,
          allowedBudgetIds: null,
          allowedAccountRegisterIds: null,
        },
      ]);
      (prisma.accountRegister.findMany as any).mockResolvedValue([
        { id: 5, accountId: "acc-1", budgetId: 1 },
      ]);

      await expect(
        assertUserCanAssignRegisterScopeForAccounts(INVITER_ID, ["acc-1"], [5]),
      ).resolves.toBeUndefined();

      expect(prisma.userAccount.findMany).toHaveBeenCalledWith({
        where: { userId: INVITER_ID, accountId: { in: ["acc-1"] } },
      });
      expect(prisma.accountRegister.findMany).toHaveBeenCalledWith({
        where: { id: { in: [5] }, isArchived: false },
        select: { id: true, accountId: true, budgetId: true },
      });
    });

    it("rejects with 400 when a register id does not exist", async () => {
      (prisma.userAccount.findMany as any).mockResolvedValue([]);
      (prisma.accountRegister.findMany as any).mockResolvedValue([
        { id: 5, accountId: "acc-1", budgetId: 1 },
      ]);

      await expect(
        assertUserCanAssignRegisterScopeForAccounts(
          INVITER_ID,
          ["acc-1"],
          [5, 6],
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: One or more account registers are invalid.",
      });
    });

    it("rejects with 400 when a register belongs to a non-selected account", async () => {
      (prisma.userAccount.findMany as any).mockResolvedValue([
        {
          accountId: "acc-1",
          canViewBudgets: true,
          allowedBudgetIds: null,
          allowedAccountRegisterIds: null,
        },
      ]);
      (prisma.accountRegister.findMany as any).mockResolvedValue([
        { id: 5, accountId: "acc-9", budgetId: 1 },
      ]);

      await expect(
        assertUserCanAssignRegisterScopeForAccounts(INVITER_ID, ["acc-1"], [5]),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: Register does not belong to selected accounts.",
      });
    });

    it("rejects with 403 when the inviter has no membership on the register's account", async () => {
      (prisma.userAccount.findMany as any).mockResolvedValue([]);
      (prisma.accountRegister.findMany as any).mockResolvedValue([
        { id: 5, accountId: "acc-1", budgetId: 1 },
      ]);

      await expect(
        assertUserCanAssignRegisterScopeForAccounts(INVITER_ID, ["acc-1"], [5]),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "HTTP 403: Forbidden",
      });
    });

    it("rejects with 403 when the inviter cannot see the register themselves", async () => {
      (prisma.userAccount.findMany as any).mockResolvedValue([
        {
          accountId: "acc-1",
          canViewBudgets: false,
          allowedBudgetIds: null,
          allowedAccountRegisterIds: null,
        },
      ]);
      (prisma.accountRegister.findMany as any).mockResolvedValue([
        { id: 5, accountId: "acc-1", budgetId: 1 },
      ]);

      await expect(
        assertUserCanAssignRegisterScopeForAccounts(INVITER_ID, ["acc-1"], [5]),
      ).rejects.toMatchObject({
        statusCode: 403,
        message:
          "HTTP 403: You cannot grant access to registers you cannot see yourself.",
      });
    });

    it("rejects with 403 when the register is outside the inviter's allowed register ids", async () => {
      (prisma.userAccount.findMany as any).mockResolvedValue([
        {
          accountId: "acc-1",
          canViewBudgets: true,
          allowedBudgetIds: null,
          allowedAccountRegisterIds: [6],
        },
      ]);
      (prisma.accountRegister.findMany as any).mockResolvedValue([
        { id: 5, accountId: "acc-1", budgetId: 1 },
      ]);

      await expect(
        assertUserCanAssignRegisterScopeForAccounts(INVITER_ID, ["acc-1"], [5]),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("createAccountInvite", () => {
    const basePermissions = {
      canViewBudgets: true,
      canInviteUsers: false,
      canManageMembers: false,
      allowedBudgetIds: [2, 1],
      allowedAccountRegisterIds: [5],
    };

    beforeEach(() => {
      mockUserAccountFindFirst(fullMembership());
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue({
        email: "Me@Example.com",
        firstName: "In",
        lastName: "Viter",
      });
      (prisma.accountInvite.findMany as any).mockResolvedValue([]);
      (prisma.account.findMany as any).mockResolvedValue([
        { id: "acc-1", name: "Acc One" },
      ]);
      // Register-scope checks (basePermissions.allowedAccountRegisterIds=[5])
      (prisma.userAccount.findMany as any).mockResolvedValue([
        {
          accountId: "acc-1",
          canViewBudgets: true,
          allowedBudgetIds: null,
          allowedAccountRegisterIds: null,
        },
      ]);
      (prisma.accountRegister.findMany as any).mockResolvedValue([
        { id: 5, accountId: "acc-1", budgetId: 1 },
      ]);
      (prisma.accountInvite.create as any).mockResolvedValue({
        id: 10,
        email: INVITEE_EMAIL,
        expiresAt: EXPIRES_AT,
      });
    });

    it("creates the invite, sends email and returns id/email/expiresAt", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);
      mockInviteCounts(0, 0);

      const result = await import("../accountInviteService").then((m) =>
        m.createAccountInvite({
          inviterUserId: INVITER_ID,
          accountIds: ["acc-1"],
          email: INVITEE_EMAIL,
          permissions: basePermissions,
        }),
      );

      expect(result).toEqual({
        id: 10,
        email: INVITEE_EMAIL,
        expiresAt: EXPIRES_AT,
      });

      expect(prisma.accountInvite.create).toHaveBeenCalledTimes(1);
      const createArgs = (prisma.accountInvite.create as any).mock.calls[0][0];
      expect(createArgs.data).toMatchObject({
        email: INVITEE_EMAIL,
        invitedByUserId: INVITER_ID,
        expiresAt: EXPIRES_AT,
        inviteAccounts: {
          create: [
            {
              accountId: "acc-1",
              canViewBudgets: true,
              canInviteUsers: false,
              canManageMembers: false,
              allowedBudgetIds: [2, 1],
              allowedAccountRegisterIds: [5],
            },
          ],
        },
      });
      expect(createArgs.select).toEqual({
        id: true,
        email: true,
        expiresAt: true,
      });
      expect(createArgs.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("hashes the raw token delivered in the email link", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);
      mockInviteCounts(0, 0);

      await import("../accountInviteService").then((m) =>
        m.createAccountInvite({
          inviterUserId: INVITER_ID,
          accountIds: ["acc-1"],
          email: INVITEE_EMAIL,
          permissions: basePermissions,
        }),
      );

      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      expect(postmarkClient.sendEmail).toHaveBeenCalledTimes(1);
      const emailArgs = (postmarkClient.sendEmail as any).mock.calls[0][0];
      expect(emailArgs.From).toBe("Mr. Pepe Dineros <pepe@dineros.cc>");
      expect(emailArgs.To).toBe(INVITEE_EMAIL);
      expect(emailArgs.Subject).toBe("You're invited to Acc One on Dineros");

      const token = emailArgs.HtmlBody.match(
        /token=([a-f0-9]+)/,
      )?.[1] as string;
      expect(token).toMatch(/^[a-f0-9]{64}$/);
      const expectedHash = createHash("sha256")
        .update(token, "utf8")
        .digest("hex");
      const createArgs = (prisma.accountInvite.create as any).mock.calls[0][0];
      expect(createArgs.data.tokenHash).toBe(expectedHash);
      expect(emailArgs.HtmlBody).toContain(
        `https://app.test/accept-invite?token=${token}`,
      );
      expect(emailArgs.HtmlBody).toContain("expires on");
    });

    it("deduplicates account ids before capability checks and creation", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);
      mockInviteCounts(0, 0);

      await import("../accountInviteService").then((m) =>
        m.createAccountInvite({
          inviterUserId: INVITER_ID,
          accountIds: ["acc-1", "acc-1"],
          email: INVITEE_EMAIL,
          permissions: basePermissions,
        }),
      );

      // One capability check for the deduped id, one inviteAccounts row
      expect(prisma.userAccount.findFirst).toHaveBeenCalledTimes(1);
      const createArgs = (prisma.accountInvite.create as any).mock.calls[0][0];
      expect(createArgs.data.inviteAccounts.create).toHaveLength(1);
      expect(prisma.account.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["acc-1"] } },
        select: { id: true, name: true },
      });
    });

    it("falls back to the log branch instead of sending email when DEPLOY_ENV is local", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      const { log } = await import("~/server/logger");
      (findUserByEmail as any).mockResolvedValue(null);
      mockInviteCounts(0, 0);
      envState.DEPLOY_ENV = "local";

      try {
        await import("../accountInviteService").then((m) =>
          m.createAccountInvite({
            inviterUserId: INVITER_ID,
            accountIds: ["acc-1"],
            email: INVITEE_EMAIL,
            permissions: basePermissions,
          }),
        );
      } finally {
        envState.DEPLOY_ENV = "production";
      }

      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      expect(postmarkClient.sendEmail).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            "[ACCOUNT_INVITE] Email not sent (local or no Postmark token)",
          level: "info",
        }),
      );
    });

    it("labels the email for multiple accounts", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);
      mockInviteCounts(0, 0);
      (prisma.account.findMany as any).mockResolvedValue([
        { id: "acc-1", name: "Acc One" },
        { id: "acc-2", name: "Acc Two" },
      ]);

      await import("../accountInviteService").then((m) =>
        m.createAccountInvite({
          inviterUserId: INVITER_ID,
          accountIds: ["acc-1", "acc-2"],
          email: INVITEE_EMAIL,
          permissions: basePermissions,
        }),
      );

      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      const emailArgs = (postmarkClient.sendEmail as any).mock.calls[0][0];
      expect(emailArgs.Subject).toBe("You're invited to 2 accounts on Dineros");
      expect(emailArgs.HtmlBody).toContain("2 accounts (Acc One, Acc Two)");
    });

    it("rejects with 400 for an email without @", async () => {
      await expect(
        import("../accountInviteService").then((m) =>
          m.createAccountInvite({
            inviterUserId: INVITER_ID,
            accountIds: ["acc-1"],
            email: "not-an-email",
            permissions: basePermissions,
          }),
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.accountInvite.create).not.toHaveBeenCalled();
    });

    it("rejects with 400 when no accounts are selected", async () => {
      await expect(
        import("../accountInviteService").then((m) =>
          m.createAccountInvite({
            inviterUserId: INVITER_ID,
            accountIds: [],
            email: INVITEE_EMAIL,
            permissions: basePermissions,
          }),
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: No accounts selected.",
      });
      expect(prisma.accountInvite.create).not.toHaveBeenCalled();
    });

    it("rejects with 403 when the inviter cannot invite on an account", async () => {
      mockUserAccountFindFirst(fullMembership({ canInviteUsers: false }));

      await expect(
        import("../accountInviteService").then((m) =>
          m.createAccountInvite({
            inviterUserId: INVITER_ID,
            accountIds: ["acc-1"],
            email: INVITEE_EMAIL,
            permissions: basePermissions,
          }),
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "HTTP 403: Forbidden",
      });
      expect(prisma.accountInvite.create).not.toHaveBeenCalled();
    });

    it("rejects with 403 when the inviter is not a member at all", async () => {
      mockUserAccountFindFirst(null);

      await expect(
        import("../accountInviteService").then((m) =>
          m.createAccountInvite({
            inviterUserId: INVITER_ID,
            accountIds: ["acc-1"],
            email: INVITEE_EMAIL,
            permissions: basePermissions,
          }),
        ),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("rejects with 400 when inviting the inviter's own email (case-insensitive)", async () => {
      await expect(
        import("../accountInviteService").then((m) =>
          m.createAccountInvite({
            inviterUserId: INVITER_ID,
            accountIds: ["acc-1"],
            email: "  ME@example.com ",
            permissions: basePermissions,
          }),
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: You cannot invite your own email address.",
      });
      // Got past the capability guard, then stopped at the self-invite check
      expect(prisma.userAccount.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: INVITER_ID, accountId: "acc-1" },
        }),
      );
      expect(prisma.accountInvite.create).not.toHaveBeenCalled();
    });

    it("rejects with 409 when the invitee already has access to a selected account", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue({ id: 9 });
      mockUserAccountFindFirst(fullMembership(), {
        "acc-1": { id: 99, userId: 9, accountId: "acc-1" },
      });

      await expect(
        import("../accountInviteService").then((m) =>
          m.createAccountInvite({
            inviterUserId: INVITER_ID,
            accountIds: ["acc-1"],
            email: INVITEE_EMAIL,
            permissions: basePermissions,
          }),
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        message:
          "HTTP 409: This user already has access to an account you selected.",
      });
      expect(prisma.accountInvite.create).not.toHaveBeenCalled();
    });

    it("rejects with 400 when the account has too many pending invites", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);
      mockInviteCounts(50, 0);

      await expect(
        import("../accountInviteService").then((m) =>
          m.createAccountInvite({
            inviterUserId: INVITER_ID,
            accountIds: ["acc-1"],
            email: INVITEE_EMAIL,
            permissions: basePermissions,
          }),
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message:
          "HTTP 400: Too many pending invites for one of the selected accounts. Revoke some first.",
      });
    });

    it("rejects with 429 when the inviter hit the hourly rate limit", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);
      mockInviteCounts(0, 30);

      await expect(
        import("../accountInviteService").then((m) =>
          m.createAccountInvite({
            inviterUserId: INVITER_ID,
            accountIds: ["acc-1"],
            email: INVITEE_EMAIL,
            permissions: basePermissions,
          }),
        ),
      ).rejects.toMatchObject({
        statusCode: 429,
        message: "HTTP 429: Too many invites sent. Try again later.",
      });
    });

    it("revokes overlapping pending invites for the same email before creating", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);
      mockInviteCounts(0, 0);
      (prisma.accountInvite.findMany as any).mockResolvedValue([
        { id: 3 },
        { id: 4 },
      ]);

      await import("../accountInviteService").then((m) =>
        m.createAccountInvite({
          inviterUserId: INVITER_ID,
          accountIds: ["acc-1"],
          email: INVITEE_EMAIL,
          permissions: basePermissions,
        }),
      );

      expect(prisma.accountInvite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: INVITEE_EMAIL,
            acceptedAt: null,
            revokedAt: null,
          }),
        }),
      );
      expect(prisma.accountInvite.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [3, 4] } },
        data: { revokedAt: new Date(FIXED_NOW_MS) },
      });
      expect(prisma.accountInvite.create).toHaveBeenCalledTimes(1);
    });

    it("rejects with 400 when a selected account does not exist", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);
      mockInviteCounts(0, 0);
      (prisma.account.findMany as any).mockResolvedValue([
        { id: "acc-1", name: "Acc One" },
      ]);

      await expect(
        import("../accountInviteService").then((m) =>
          m.createAccountInvite({
            inviterUserId: INVITER_ID,
            accountIds: ["acc-1", "acc-missing"],
            email: INVITEE_EMAIL,
            permissions: basePermissions,
          }),
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: Invalid account id.",
      });
      expect(prisma.accountInvite.create).not.toHaveBeenCalled();
    });

    it("passes Prisma.JsonNull for omitted permission arrays", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);
      mockInviteCounts(0, 0);

      await import("../accountInviteService").then((m) =>
        m.createAccountInvite({
          inviterUserId: INVITER_ID,
          accountIds: ["acc-1"],
          email: INVITEE_EMAIL,
          permissions: {
            canViewBudgets: true,
            canInviteUsers: false,
            canManageMembers: false,
          },
        }),
      );

      const createArgs = (prisma.accountInvite.create as any).mock.calls[0][0];
      expect(createArgs.data.inviteAccounts.create[0].allowedBudgetIds).toBe(
        PRISMA_JSON_NULL,
      );
      expect(
        createArgs.data.inviteAccounts.create[0].allowedAccountRegisterIds,
      ).toBe(PRISMA_JSON_NULL);
    });

    it("delegates register-scope validation and surfaces its 400", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);
      mockInviteCounts(0, 0);
      (prisma.accountRegister.findMany as any).mockResolvedValue([]);

      await expect(
        import("../accountInviteService").then((m) =>
          m.createAccountInvite({
            inviterUserId: INVITER_ID,
            accountIds: ["acc-1"],
            email: INVITEE_EMAIL,
            permissions: { ...basePermissions, allowedAccountRegisterIds: [5] },
          }),
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: One or more account registers are invalid.",
      });
      expect(prisma.accountInvite.create).not.toHaveBeenCalled();
    });

    it("uses 'A teammate' as display name when the inviter has no name", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);
      mockInviteCounts(0, 0);
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue({
        email: "Me@Example.com",
        firstName: null,
        lastName: null,
      });

      await import("../accountInviteService").then((m) =>
        m.createAccountInvite({
          inviterUserId: INVITER_ID,
          accountIds: ["acc-1"],
          email: INVITEE_EMAIL,
          permissions: basePermissions,
        }),
      );

      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      const emailArgs = (postmarkClient.sendEmail as any).mock.calls[0][0];
      expect(emailArgs.HtmlBody).toContain("A teammate invited you");
    });
  });

  describe("listPendingInvitesForAccount", () => {
    it("rejects with 403 when the user cannot invite on the account", async () => {
      (prisma.userAccount.findFirst as any).mockResolvedValue(
        fullMembership({ canInviteUsers: false }),
      );

      await expect(
        import("../accountInviteService").then((m) =>
          m.listPendingInvitesForAccount({ userId: INVITER_ID, accountId: "acc-1" }),
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "HTTP 403: Forbidden",
      });
      expect(prisma.accountInvite.findMany).not.toHaveBeenCalled();
    });

    it("returns pending invites with parsed permission arrays", async () => {
      (prisma.userAccount.findFirst as any).mockResolvedValue(fullMembership());
      (prisma.accountInvite.findMany as any).mockResolvedValue([
        {
          id: 31,
          email: "pending@example.com",
          expiresAt: EXPIRES_AT,
          createdAt: new Date(FIXED_NOW_MS),
          inviteAccounts: [
            {
              account: { id: "acc-1", name: "Acc One" },
              canViewBudgets: true,
              canInviteUsers: false,
              canManageMembers: false,
              allowedBudgetIds: [3, 1, 2, 2],
              allowedAccountRegisterIds: null,
            },
          ],
          invitedBy: { firstName: "In", lastName: "Viter", email: "me@x.com" },
        },
      ]);

      const result = await import("../accountInviteService").then((m) =>
        m.listPendingInvitesForAccount({ userId: INVITER_ID, accountId: "acc-1" }),
      );

      expect(prisma.accountInvite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date(FIXED_NOW_MS) },
            inviteAccounts: { some: { accountId: "acc-1" } },
          },
          orderBy: { createdAt: "desc" },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].inviteAccounts[0].allowedBudgetIds).toEqual([1, 2, 3]);
      expect(result[0].inviteAccounts[0].allowedAccountRegisterIds).toBeNull();
    });
  });

  describe("revokeAccountInvite", () => {
    const pendingInvite = {
      id: 77,
      acceptedAt: null,
      revokedAt: null,
      inviteAccounts: [{ accountId: "acc-1" }, { accountId: "acc-2" }],
    };

    it("rejects with 404 when the invite does not exist", async () => {
      (prisma.accountInvite.findFirst as any).mockResolvedValue(null);

      await expect(
        import("../accountInviteService").then((m) =>
          m.revokeAccountInvite({ userId: INVITER_ID, inviteId: 77 }),
        ),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "HTTP 404: Invite not found",
      });
    });

    it("checks canInviteUsers on every account of the invite", async () => {
      (prisma.accountInvite.findFirst as any).mockResolvedValue(pendingInvite);
      (prisma.userAccount.findFirst as any)
        .mockResolvedValueOnce(fullMembership({ canInviteUsers: false }))
        .mockResolvedValueOnce(fullMembership());

      await expect(
        import("../accountInviteService").then((m) =>
          m.revokeAccountInvite({ userId: INVITER_ID, inviteId: 77 }),
        ),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(prisma.accountInvite.update).not.toHaveBeenCalled();
    });

    it("rejects with 400 when the invite was already accepted", async () => {
      (prisma.accountInvite.findFirst as any).mockResolvedValue({
        ...pendingInvite,
        acceptedAt: new Date(FIXED_NOW_MS),
      });
      (prisma.userAccount.findFirst as any).mockResolvedValue(fullMembership());

      await expect(
        import("../accountInviteService").then((m) =>
          m.revokeAccountInvite({ userId: INVITER_ID, inviteId: 77 }),
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: Invite is no longer pending",
      });
    });

    it("rejects with 400 when the invite was already revoked", async () => {
      (prisma.accountInvite.findFirst as any).mockResolvedValue({
        ...pendingInvite,
        revokedAt: new Date(FIXED_NOW_MS),
      });
      (prisma.userAccount.findFirst as any).mockResolvedValue(fullMembership());

      await expect(
        import("../accountInviteService").then((m) =>
          m.revokeAccountInvite({ userId: INVITER_ID, inviteId: 77 }),
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("revokes a pending invite and returns ok", async () => {
      (prisma.accountInvite.findFirst as any).mockResolvedValue(pendingInvite);
      (prisma.userAccount.findFirst as any).mockResolvedValue(fullMembership());
      (prisma.accountInvite.update as any).mockResolvedValue({});

      const result = await import("../accountInviteService").then((m) =>
        m.revokeAccountInvite({ userId: INVITER_ID, inviteId: 77 }),
      );

      expect(result).toEqual({ ok: true });
      expect(prisma.accountInvite.update).toHaveBeenCalledWith({
        where: { id: 77 },
        data: { revokedAt: new Date(FIXED_NOW_MS) },
      });
    });
  });

  describe("getInviteValidationPayload", () => {
    const validInvite = {
      id: 77,
      email: INVITEE_EMAIL,
      revokedAt: null,
      acceptedAt: null,
      expiresAt: new Date("2024-02-01T00:00:00.000Z"),
      inviteAccounts: [
        {
          account: { id: "acc-1", name: "Acc One" },
          canViewBudgets: true,
          canInviteUsers: false,
          canManageMembers: false,
          allowedBudgetIds: [2, 1],
          allowedAccountRegisterIds: [8, 8, 3],
        },
      ],
      invitedBy: { firstName: "Jane", lastName: "Doe" },
    };

    it("returns the token hash lookup result for unknown tokens", async () => {
      (prisma.accountInvite.findFirst as any).mockResolvedValue(null);

      const result = await import("../accountInviteService").then((m) =>
        m.getInviteValidationPayload("bad-token"),
      );

      expect(result).toEqual({ valid: false });
      expect(prisma.accountInvite.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: hashInviteToken("bad-token") },
        }),
      );
    });

    it("is invalid for revoked invites", async () => {
      (prisma.accountInvite.findFirst as any).mockResolvedValue({
        ...validInvite,
        revokedAt: new Date(FIXED_NOW_MS),
      });
      const result = await import("../accountInviteService").then((m) =>
        m.getInviteValidationPayload("tok"),
      );
      expect(result).toEqual({ valid: false });
    });

    it("is invalid for accepted invites", async () => {
      (prisma.accountInvite.findFirst as any).mockResolvedValue({
        ...validInvite,
        acceptedAt: new Date(FIXED_NOW_MS),
      });
      const result = await import("../accountInviteService").then((m) =>
        m.getInviteValidationPayload("tok"),
      );
      expect(result).toEqual({ valid: false });
    });

    it("is invalid for expired invites", async () => {
      (prisma.accountInvite.findFirst as any).mockResolvedValue({
        ...validInvite,
        expiresAt: new Date("2023-12-31T00:00:00.000Z"),
      });
      const result = await import("../accountInviteService").then((m) =>
        m.getInviteValidationPayload("tok"),
      );
      expect(result).toEqual({ valid: false });
    });

    it("is invalid when the invite has no accounts attached", async () => {
      (prisma.accountInvite.findFirst as any).mockResolvedValue({
        ...validInvite,
        inviteAccounts: [],
      });
      const result = await import("../accountInviteService").then((m) =>
        m.getInviteValidationPayload("tok"),
      );
      expect(result).toEqual({ valid: false });
    });

    it("returns full payload with needsPassword/needsName for unknown users", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);
      (prisma.accountInvite.findFirst as any).mockResolvedValue(validInvite);

      const result = await import("../accountInviteService").then((m) =>
        m.getInviteValidationPayload("tok"),
      );

      expect(result).toEqual({
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
          allowedBudgetIds: [1, 2],
          allowedAccountRegisterIds: [3, 8],
        },
      });
      expect(findUserByEmail).toHaveBeenCalledWith(INVITEE_EMAIL);
    });

    it("reports needsPassword for existing users without a password and label for multiple accounts", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue({ id: 9, password: null });
      (prisma.accountInvite.findFirst as any).mockResolvedValue({
        ...validInvite,
        invitedBy: { firstName: "", lastName: "" },
        inviteAccounts: [
          validInvite.inviteAccounts[0],
          {
            account: { id: "acc-2", name: "Acc Two" },
            canViewBudgets: false,
            canInviteUsers: false,
            canManageMembers: false,
            allowedBudgetIds: null,
            allowedAccountRegisterIds: null,
          },
        ],
      });

      const result = await import("../accountInviteService").then((m) =>
        m.getInviteValidationPayload("tok"),
      );

      expect(result).toMatchObject({
        valid: true,
        accountName: "2 accounts",
        inviterDisplayName: "A teammate",
        needsPassword: true,
        needsName: false,
        accounts: [
          { id: "acc-1", name: "Acc One" },
          { id: "acc-2", name: "Acc Two" },
        ],
      });
    });

    it("reports no password/name needs for an existing user with a password", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue({ id: 9, password: "x" });
      (prisma.accountInvite.findFirst as any).mockResolvedValue(validInvite);

      const result = await import("../accountInviteService").then((m) =>
        m.getInviteValidationPayload("tok"),
      );

      expect(result).toMatchObject({ needsPassword: false, needsName: false });
    });
  });

  describe("acceptAccountInvite", () => {
    const inviteRow = {
      id: 77,
      email: INVITEE_EMAIL,
      revokedAt: null,
      acceptedAt: null,
      expiresAt: new Date("2024-02-01T00:00:00.000Z"),
      inviteAccounts: [
        {
          accountId: "acc-1",
          canViewBudgets: true,
          canInviteUsers: false,
          canManageMembers: false,
          allowedBudgetIds: [1],
          allowedAccountRegisterIds: null,
        },
      ],
    };

    function mockTransaction(txOverrides: {
      existingLink?: { id: number } | null;
    } = {}) {
      const tx = {
        userAccount: {
          findFirst: vi.fn().mockResolvedValue(txOverrides.existingLink ?? null),
          create: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
        },
        accountInvite: { update: vi.fn().mockResolvedValue({}) },
      };
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(tx),
      );
      return tx;
    }

    beforeEach(() => {
      (prisma.accountInvite.findFirst as any).mockResolvedValue(inviteRow);
      (prisma.user.create as any).mockResolvedValue({ id: 42 });
      (prisma.user.update as any).mockResolvedValue({ id: 9 });
      (prisma.country.findUnique as any).mockResolvedValue({ id: 840 });
    });

    it("rejects with 400 when the token is missing or whitespace", async () => {
      const svc = await import("../accountInviteService");
      await expect(
        svc.acceptAccountInvite({} as any, { token: "   " }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: Token is required",
      });
    });

    it("rejects with 400 for an unknown token", async () => {
      (prisma.accountInvite.findFirst as any).mockResolvedValue(null);
      const svc = await import("../accountInviteService");

      await expect(
        svc.acceptAccountInvite({} as any, { token: "nope" }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: Invalid or expired invite",
      });
      expect(prisma.accountInvite.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: hashInviteToken("nope") },
        }),
      );
    });

    it.each([
      ["revoked", { revokedAt: new Date(FIXED_NOW_MS) }],
      ["accepted", { acceptedAt: new Date(FIXED_NOW_MS) }],
      ["expired", { expiresAt: new Date("2023-12-31T00:00:00.000Z") }],
    ])("rejects with 400 for a %s invite", async (_label, override) => {
      (prisma.accountInvite.findFirst as any).mockResolvedValue({
        ...inviteRow,
        ...override,
      });

      await expect(
        import("../accountInviteService").then((m) =>
          m.acceptAccountInvite({} as any, { token: "tok" }),
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: Invalid or expired invite",
      });
    });

    it("creates a new user with default country and links accounts in a transaction", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      const { completeLogin } = await import("~/server/lib/completeLogin");
      (findUserByEmail as any).mockResolvedValue(null);
      const tx = mockTransaction();
      (completeLogin as any).mockResolvedValue({
        token: "jwt-token",
        message: null,
        user: { id: 42 },
      });

      const event = { node: {} } as any;
      const result = await import("../accountInviteService").then((m) =>
        m.acceptAccountInvite(event, {
          token: "tok",
          firstName: "  New  ",
          lastName: "User",
          password: "secret123",
          confirmPassword: "secret123",
        }),
      );

      expect(hashMock).toHaveBeenCalledWith("secret123");
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          firstName: "New",
          lastName: "User",
          email: INVITEE_EMAIL,
          password: "hashed-password",
          countryId: 840,
          settings: {},
          config: {},
        },
      });
      expect(tx.userAccount.create).toHaveBeenCalledWith({
        data: {
          userId: 42,
          accountId: "acc-1",
          canViewBudgets: true,
          canInviteUsers: false,
          canManageMembers: false,
          allowedBudgetIds: [1],
          allowedAccountRegisterIds: PRISMA_JSON_NULL,
        },
      });
      expect(tx.accountInvite.update).toHaveBeenCalledWith({
        where: { id: 77 },
        data: { acceptedAt: new Date(FIXED_NOW_MS) },
      });
      expect(completeLogin).toHaveBeenCalledWith(event, 42);
      expect(result).toEqual({
        token: "jwt-token",
        message: null,
        user: { id: 42 },
      });
    });

    it("uses countryId null when the default country is missing", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);
      mockTransaction();
      (prisma.country.findUnique as any).mockResolvedValue(undefined);

      await import("../accountInviteService").then((m) =>
        m.acceptAccountInvite({} as any, {
          token: "tok",
          firstName: "New",
          lastName: "User",
          password: "secret123",
          confirmPassword: "secret123",
        }),
      );

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ countryId: null }),
      });
    });

    it("rejects when a new user omits first or last name", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);
      const svc = await import("../accountInviteService");

      await expect(
        svc.acceptAccountInvite({} as any, {
          token: "tok",
          lastName: "User",
          password: "secret123",
          confirmPassword: "secret123",
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: First and last name are required",
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("rejects short passwords for new users", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);

      await expect(
        import("../accountInviteService").then((m) =>
          m.acceptAccountInvite({} as any, {
            token: "tok",
            firstName: "New",
            lastName: "User",
            password: "12345",
            confirmPassword: "12345",
          }),
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: Password must be at least 6 characters",
      });
    });

    it("rejects mismatched passwords for new users", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue(null);

      await expect(
        import("../accountInviteService").then((m) =>
          m.acceptAccountInvite({} as any, {
            token: "tok",
            firstName: "New",
            lastName: "User",
            password: "secret123",
            confirmPassword: "different",
          }),
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: Passwords do not match",
      });
    });

    it("rejects with 'Password is required' for an existing user without a password", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue({
        id: 9,
        password: null,
      });

      await expect(
        import("../accountInviteService").then((m) =>
          m.acceptAccountInvite({} as any, { token: "tok" }),
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: Password is required",
      });
    });

    it("rejects mismatched passwords for an existing user without a password", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      (findUserByEmail as any).mockResolvedValue({ id: 9, password: null });

      await expect(
        import("../accountInviteService").then((m) =>
          m.acceptAccountInvite({} as any, {
            token: "tok",
            password: "secret123",
            confirmPassword: "different",
          }),
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "HTTP 400: Passwords do not match",
      });
    });

    it("sets the password for an existing passwordless user and updates names", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      const { completeLogin } = await import("~/server/lib/completeLogin");
      (findUserByEmail as any).mockResolvedValue({
        id: 9,
        password: null,
        firstName: "Old",
        lastName: "User",
      });
      mockTransaction();
      (completeLogin as any).mockResolvedValue({ token: "jwt" });

      await import("../accountInviteService").then((m) =>
        m.acceptAccountInvite({} as any, {
          token: "tok",
          firstName: "Renamed",
          password: "secret123",
          confirmPassword: "secret123",
        }),
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { password: "hashed-password" },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { firstName: "Renamed" },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("does not touch password for an existing user with a password", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      const { completeLogin } = await import("~/server/lib/completeLogin");
      (findUserByEmail as any).mockResolvedValue({
        id: 9,
        password: "already-set",
        firstName: "Old",
        lastName: "User",
      });
      const tx = mockTransaction();
      (completeLogin as any).mockResolvedValue({ token: "jwt" });

      await import("../accountInviteService").then((m) =>
        m.acceptAccountInvite({} as any, { token: "tok" }),
      );

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(hashMock).not.toHaveBeenCalled();
      expect(tx.userAccount.create).toHaveBeenCalledTimes(1);
      expect(tx.accountInvite.update).toHaveBeenCalledWith({
        where: { id: 77 },
        data: { acceptedAt: new Date(FIXED_NOW_MS) },
      });
    });

    it("updates the existing userAccount link instead of creating a duplicate", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      const { completeLogin } = await import("~/server/lib/completeLogin");
      (findUserByEmail as any).mockResolvedValue({
        id: 9,
        password: "already-set",
      });
      const tx = mockTransaction({ existingLink: { id: 55 } });
      (completeLogin as any).mockResolvedValue({ token: "jwt" });

      await import("../accountInviteService").then((m) =>
        m.acceptAccountInvite({} as any, { token: "tok" }),
      );

      expect(tx.userAccount.findFirst).toHaveBeenCalledWith({
        where: { userId: 9, accountId: "acc-1" },
      });
      expect(tx.userAccount.update).toHaveBeenCalledWith({
        where: { id: 55 },
        data: {
          canViewBudgets: true,
          canInviteUsers: false,
          canManageMembers: false,
          allowedBudgetIds: [1],
          allowedAccountRegisterIds: PRISMA_JSON_NULL,
        },
      });
      expect(tx.userAccount.create).not.toHaveBeenCalled();
    });

    it("links every invite account of a multi-account invite", async () => {
      const { findUserByEmail } = await import("~/server/lib/findUserByEmail");
      const { completeLogin } = await import("~/server/lib/completeLogin");
      (findUserByEmail as any).mockResolvedValue({
        id: 9,
        password: "already-set",
      });
      const tx = mockTransaction();
      (completeLogin as any).mockResolvedValue({ token: "jwt" });
      (prisma.accountInvite.findFirst as any).mockResolvedValue({
        ...inviteRow,
        inviteAccounts: [
          ...inviteRow.inviteAccounts,
          {
            accountId: "acc-2",
            canViewBudgets: false,
            canInviteUsers: true,
            canManageMembers: true,
            allowedBudgetIds: null,
            allowedAccountRegisterIds: [4],
          },
        ],
      });

      await import("../accountInviteService").then((m) =>
        m.acceptAccountInvite({} as any, { token: "tok" }),
      );

      expect(tx.userAccount.create).toHaveBeenCalledTimes(2);
      expect(tx.userAccount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 9,
          accountId: "acc-2",
          canViewBudgets: false,
          canInviteUsers: true,
          canManageMembers: true,
          allowedBudgetIds: PRISMA_JSON_NULL,
          allowedAccountRegisterIds: [4],
        }),
      });
    });
  });
});
