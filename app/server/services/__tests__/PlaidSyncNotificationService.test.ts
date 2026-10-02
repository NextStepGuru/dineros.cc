import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { dateTimeService } from "~/server/services/forecast/DateTimeService";

const testState = vi.hoisted(() => ({
  deployEnv: "production" as string | undefined,
  hasPostmarkToken: true,
}));

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/clients/postmarkClient", () => ({
  get hasPostmarkToken() {
    return testState.hasPostmarkToken;
  },
  postmarkClient: { sendEmail: vi.fn() },
}));

vi.mock("~/server/env", () => ({
  default: {
    get DEPLOY_ENV() {
      return testState.deployEnv;
    },
  },
}));

vi.mock("~/server/lib/appUrl", () => ({
  buildAppUrl: vi.fn((path: string) => `http://test.local${path}`),
}));

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import { prisma } from "~/server/clients/prismaClient";
// eslint-disable-next-line import/first -- mocks must be registered first
import {
  sendPlaidSyncSummaryEmail,
  sendPlaidConnectionIssueEmailIfEligible,
} from "../PlaidSyncNotificationService";

const registers = [
  { accountRegisterId: 1, name: "Checking", newCount: 2, updatedCount: 1 },
  { accountRegisterId: 2, name: "Card", newCount: 0, updatedCount: 3 },
];

function mockUserRow(overrides: Record<string, unknown> = {}) {
  return {
    email: "user@test.cc",
    firstName: "Pepe",
    settings: {},
    ...overrides,
  };
}

describe("PlaidSyncNotificationService", () => {
  beforeAll(() => {
    // Deterministic 24h-cooldown comparisons
    dateTimeService.setNowOverride(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterAll(() => {
    dateTimeService.clearNowOverride();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    testState.deployEnv = "production";
    testState.hasPostmarkToken = true;
  });

  describe("sendPlaidSyncSummaryEmail", () => {
    it("returns early without any lookups when there are no register stats", async () => {
      await sendPlaidSyncSummaryEmail({
        userId: 1,
        itemId: "item-1",
        registers: [],
      });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("warns and skips when the user cannot be found", async () => {
      const { log } = await import("~/server/logger");
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(null);

      await sendPlaidSyncSummaryEmail({
        userId: 1,
        itemId: "item-1",
        registers,
      });

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Plaid sync summary email: no user email",
          level: "warn",
          data: { userId: 1 },
        }),
      );
      expect(postmarkClient.sendEmail).not.toHaveBeenCalled();
    });

    it("warns and skips when the user has no email address", async () => {
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(mockUserRow({ email: "" }));

      await sendPlaidSyncSummaryEmail({
        userId: 1,
        itemId: "item-1",
        registers,
      });

      expect(postmarkClient.sendEmail).not.toHaveBeenCalled();
    });

    it("skips users who opted out of sync summary emails", async () => {
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(
        mockUserRow({
          settings: { plaid: { transactionSyncEmail: false } },
        }),
      );

      await sendPlaidSyncSummaryEmail({
        userId: 1,
        itemId: "item-1",
        registers,
      });

      expect(postmarkClient.sendEmail).not.toHaveBeenCalled();
    });

    it("does not send in local environments", async () => {
      const { log } = await import("~/server/logger");
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      testState.deployEnv = "local";
      (prisma.user.findUnique as any).mockResolvedValue(mockUserRow());

      await sendPlaidSyncSummaryEmail({
        userId: 1,
        itemId: "item-1",
        registers,
      });

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            "[PLAID_SYNC_EMAIL] Summary not sent (local or no Postmark token)",
          level: "info",
        }),
      );
      expect(postmarkClient.sendEmail).not.toHaveBeenCalled();
    });

    it("does not send when the Postmark token is missing", async () => {
      const { log } = await import("~/server/logger");
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      testState.hasPostmarkToken = false;
      (prisma.user.findUnique as any).mockResolvedValue(mockUserRow());

      await sendPlaidSyncSummaryEmail({
        userId: 1,
        itemId: "item-1",
        registers,
      });

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            "[PLAID_SYNC_EMAIL] Summary not sent (local or no Postmark token)",
          level: "info",
          data: expect.objectContaining({ userId: 1, itemId: "item-1" }),
        }),
      );
      expect(postmarkClient.sendEmail).not.toHaveBeenCalled();
    });

    it("sends a digest email with per-register rows on the happy path", async () => {
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(mockUserRow());

      await sendPlaidSyncSummaryEmail({
        userId: 1,
        itemId: "item-1",
        registers,
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { email: true, firstName: true, settings: true },
      });
      expect(postmarkClient.sendEmail).toHaveBeenCalledTimes(1);
      const emailArg = (postmarkClient.sendEmail as any).mock.calls[0][0];
      expect(emailArg.From).toBe("Mr. Pepe Dineros <pepe@dineros.cc>");
      expect(emailArg.To).toBe("user@test.cc");
      expect(emailArg.Subject).toBe("New bank transactions synced in Dineros");
      expect(emailArg.HtmlBody).toContain("Pepe,");
      expect(emailArg.HtmlBody).toContain("2 new");
      expect(emailArg.HtmlBody).toContain("1 updated");
      expect(emailArg.HtmlBody).toContain("3 updated");
      expect(emailArg.HtmlBody).toContain(
        'href="http://test.local/account-registers"',
      );
      expect(emailArg.HtmlBody).toContain("Bank connection sync completed.");
    });

    it("escapes account names in the digest rows", async () => {
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(mockUserRow());

      await sendPlaidSyncSummaryEmail({
        userId: 1,
        itemId: "item-1",
        registers: [
          {
            accountRegisterId: 1,
            name: "<b>Evil & Co</b>",
            newCount: 1,
            updatedCount: 0,
          },
        ],
      });

      const emailArg = (postmarkClient.sendEmail as any).mock.calls[0][0];
      expect(emailArg.HtmlBody).toContain("&lt;b&gt;Evil &amp; Co&lt;/b&gt;");
      expect(emailArg.HtmlBody).not.toContain("<b>Evil");
    });

    it("falls back to a generic greeting when the first name is blank", async () => {
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(
        mockUserRow({ firstName: "   " }),
      );

      await sendPlaidSyncSummaryEmail({
        userId: 1,
        itemId: undefined,
        registers,
      });

      const emailArg = (postmarkClient.sendEmail as any).mock.calls[0][0];
      expect(emailArg.HtmlBody.startsWith("Hi,")).toBe(true);
      expect(emailArg.HtmlBody).not.toContain("Bank connection sync completed.");
    });
  });

  describe("sendPlaidConnectionIssueEmailIfEligible", () => {
    it("returns false when the user cannot be found", async () => {
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(null);

      const result = await sendPlaidConnectionIssueEmailIfEligible({
        userId: 1,
        itemId: "item-1",
        webhookCode: "ERROR",
      });

      expect(result).toBe(false);
      expect(postmarkClient.sendEmail).not.toHaveBeenCalled();
    });

    it("returns false when the user has no email address", async () => {
      const { log } = await import("~/server/logger");
      (prisma.user.findUnique as any).mockResolvedValue(mockUserRow({ email: "" }));

      const result = await sendPlaidConnectionIssueEmailIfEligible({
        userId: 1,
        itemId: "item-1",
        webhookCode: "ERROR",
      });

      expect(result).toBe(false);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Plaid connection issue email: no user email",
          level: "warn",
        }),
      );
    });

    it("returns false when the user opted out of connection issue emails", async () => {
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(
        mockUserRow({
          settings: { plaid: { connectionIssueEmail: false } },
        }),
      );

      const result = await sendPlaidConnectionIssueEmailIfEligible({
        userId: 1,
        itemId: "item-1",
        webhookCode: "ERROR",
      });

      expect(result).toBe(false);
      expect(postmarkClient.sendEmail).not.toHaveBeenCalled();
    });

    it("skips users within the 24h cooldown of the last email", async () => {
      const { log } = await import("~/server/logger");
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(
        mockUserRow({
          settings: {
            plaid: { lastConnectionIssueEmailAt: "2024-01-01T00:00:00.000Z" },
          },
        }),
      );

      const result = await sendPlaidConnectionIssueEmailIfEligible({
        userId: 1,
        itemId: "item-1",
        webhookCode: "ERROR",
      });

      expect(result).toBe(false);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            "[PLAID_CONNECTION_EMAIL] Skipped (within 24h cooldown of last send)",
          level: "debug",
        }),
      );
      expect(postmarkClient.sendEmail).not.toHaveBeenCalled();
    });

    it("sends after the 24h cooldown has elapsed", async () => {
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(
        mockUserRow({
          settings: {
            plaid: { lastConnectionIssueEmailAt: "2023-12-30T00:00:00.000Z" },
          },
        }),
      );

      const result = await sendPlaidConnectionIssueEmailIfEligible({
        userId: 1,
        itemId: "item-1",
        webhookCode: "LOGIN_REQUIRED",
      });

      expect(result).toBe(true);
      expect(postmarkClient.sendEmail).toHaveBeenCalledTimes(1);
      const emailArg = (postmarkClient.sendEmail as any).mock.calls[0][0];
      expect(emailArg.From).toBe("Mr. Pepe Dineros <pepe@dineros.cc>");
      expect(emailArg.To).toBe("user@test.cc");
      expect(emailArg.Subject).toBe(
        "Action needed: reconnect your bank in Dineros",
      );
      expect(emailArg.HtmlBody).toContain("Pepe,");
      expect(emailArg.HtmlBody).toContain("LOGIN_REQUIRED");
      expect(emailArg.HtmlBody).toContain(
        'href="http://test.local/edit-profile/sync-accounts"',
      );
    });

    it("treats invalid cooldown timestamps as expired", async () => {
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(
        mockUserRow({
          settings: { plaid: { lastConnectionIssueEmailAt: "not-a-date" } },
        }),
      );

      const result = await sendPlaidConnectionIssueEmailIfEligible({
        userId: 1,
        itemId: "item-1",
        webhookCode: "ERROR",
      });

      expect(result).toBe(true);
      expect(postmarkClient.sendEmail).toHaveBeenCalledTimes(1);
    });

    it("returns false in local environments", async () => {
      const { log } = await import("~/server/logger");
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      testState.deployEnv = "local";
      (prisma.user.findUnique as any).mockResolvedValue(mockUserRow());

      const result = await sendPlaidConnectionIssueEmailIfEligible({
        userId: 1,
        itemId: "item-1",
        webhookCode: "ERROR",
      });

      expect(result).toBe(false);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "[PLAID_CONNECTION_EMAIL] Not sent (local or no Postmark token)",
          level: "info",
        }),
      );
      expect(postmarkClient.sendEmail).not.toHaveBeenCalled();
    });

    it("returns false when the Postmark token is missing", async () => {
      const { log } = await import("~/server/logger");
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      testState.hasPostmarkToken = false;
      (prisma.user.findUnique as any).mockResolvedValue(mockUserRow());

      const result = await sendPlaidConnectionIssueEmailIfEligible({
        userId: 1,
        itemId: "item-1",
        webhookCode: "ERROR",
      });

      expect(result).toBe(false);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "[PLAID_CONNECTION_EMAIL] Not sent (local or no Postmark token)",
          level: "info",
        }),
      );
      expect(postmarkClient.sendEmail).not.toHaveBeenCalled();
    });

    it("escapes the webhook code in the email body", async () => {
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(mockUserRow());

      await sendPlaidConnectionIssueEmailIfEligible({
        userId: 1,
        itemId: "item-1",
        webhookCode: '<script>alert("x")</script>',
      });

      const emailArg = (postmarkClient.sendEmail as any).mock.calls[0][0];
      expect(emailArg.HtmlBody).toContain(
        "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
      );
      expect(emailArg.HtmlBody).not.toContain("<script>");
    });
  });
});
