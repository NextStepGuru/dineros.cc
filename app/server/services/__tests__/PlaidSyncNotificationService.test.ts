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

  describe("sendPlaidSyncSummaryEmail transaction details", () => {
    const registersWithDetails = [
      {
        accountRegisterId: 1,
        name: "Checking",
        newCount: 2,
        updatedCount: 1,
        newRecords: [
          { registerId: 1, entryId: "entry-new-1" },
          { registerId: 1, entryId: "entry-new-2" },
        ],
        updatedRecords: [
          {
            registerId: 1,
            entryId: "entry-upd-1",
            note: "Pending transaction posted; Amount changed -$90.00 → -$100.00",
          },
        ],
        categoryChanges: [
          {
            registerId: 1,
            entryId: "entry-upd-1",
            fromCategoryId: "cat-old",
            toCategoryId: "cat-new",
            source: "ai",
          },
          {
            registerId: 1,
            entryId: "entry-new-2",
            fromCategoryId: null,
            toCategoryId: "cat-travel",
            source: "rule",
          },
        ],
      },
    ];

    function mockDetailLookups() {
      (prisma.registerEntry.findMany as any).mockResolvedValue([
        {
          id: "entry-new-1",
          createdAt: new Date("2024-01-01T12:00:00.000Z"),
          description: "Coffee Shop",
          amount: -4.5,
          isPending: false,
          category: { name: "Dining" },
        },
        {
          id: "entry-new-2",
          createdAt: new Date("2024-01-02T12:00:00.000Z"),
          description: "Uber",
          amount: -24.5,
          isPending: true,
          category: null,
        },
        {
          id: "entry-upd-1",
          createdAt: new Date("2024-01-03T12:00:00.000Z"),
          description: "Rent <b>Extra</b>",
          amount: "-1500.00",
          isPending: false,
          category: { name: "Housing" },
        },
      ]);
      (prisma.category.findMany as any).mockResolvedValue([
        { id: "cat-old", name: "Old & Stale" },
        { id: "cat-new", name: "Housing" },
        { id: "cat-travel", name: "Transportation" },
      ]);
    }

    it("renders new transactions, updates with change notes, and auto-category changes", async () => {
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(mockUserRow());
      mockDetailLookups();

      await sendPlaidSyncSummaryEmail({
        userId: 1,
        itemId: "item-1",
        registers: registersWithDetails,
      });

      expect(postmarkClient.sendEmail).toHaveBeenCalledTimes(1);
      const body = (postmarkClient.sendEmail as any).mock.calls[0][0]
        .HtmlBody as string;

      // Details are resolved with two batched lookups.
      expect(prisma.registerEntry.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["entry-new-1", "entry-new-2", "entry-upd-1"] } },
        select: {
          id: true,
          createdAt: true,
          description: true,
          amount: true,
          isPending: true,
          category: { select: { name: true } },
        },
      });
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["cat-new", "cat-old", "cat-travel"] },
        },
        select: { id: true, name: true },
      });

      // New transactions section: date, description, amount, category.
      expect(body).toContain("Checking");
      expect(body).toContain("New transactions");
      expect(body).toContain("Jan 1");
      expect(body).toContain("Coffee Shop");
      expect(body).toContain("-$4.50");
      expect(body).toContain("Dining");
      expect(body).toContain("(pending)");
      expect(body).toContain("Uncategorized");

      // Updated section: change note and formatted amount from a string Decimal.
      expect(body).toContain("Updated transactions");
      expect(body).toContain(
        "Pending transaction posted; Amount changed -$90.00 &rarr; -$100.00",
      );
      expect(body).toContain("-$1,500.00");

      // Auto-category section with from → to and source label.
      expect(body).toContain("Categories updated automatically");
      expect(body).toContain("Old &amp; Stale");
      expect(body).toContain("Housing");
      expect(body).toContain("(AI)");
      expect(body).toContain("(merchant rule)");
      expect(body).toContain("Transportation");

      // Descriptions and category names are escaped.
      expect(body).toContain("Rent &lt;b&gt;Extra&lt;/b&gt;");
      expect(body).not.toContain("Rent <b>");
    });

    it("sends a counts-only email when there are no detail records", async () => {
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(mockUserRow());

      await sendPlaidSyncSummaryEmail({
        userId: 1,
        itemId: "item-1",
        registers,
      });

      expect(prisma.registerEntry.findMany).not.toHaveBeenCalled();
      expect(prisma.category.findMany).not.toHaveBeenCalled();
      const body = (postmarkClient.sendEmail as any).mock.calls[0][0]
        .HtmlBody as string;
      expect(body).not.toContain("New transactions");
    });

    it("falls back to counts-only when detail lookups fail", async () => {
      const { log } = await import("~/server/logger");
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(mockUserRow());
      (prisma.registerEntry.findMany as any).mockRejectedValue(
        new Error("lookup exploded"),
      );

      await sendPlaidSyncSummaryEmail({
        userId: 1,
        itemId: "item-1",
        registers: registersWithDetails,
      });

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            "Plaid sync summary email: failed to load transaction details, sending counts only",
          level: "warn",
        }),
      );
      const body = (postmarkClient.sendEmail as any).mock.calls[0][0]
        .HtmlBody as string;
      expect(body).toContain("2 new");
      expect(body).not.toContain("New transactions");
    });

    it("caps long sections with a +N more line", async () => {
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      (prisma.user.findUnique as any).mockResolvedValue(mockUserRow());
      const newRecords = Array.from({ length: 22 }, (_, i) => ({
        registerId: 1,
        entryId: `entry-${i}`,
      }));
      (prisma.registerEntry.findMany as any).mockResolvedValue(
        newRecords.map((rec, i) => ({
          id: rec.entryId,
          createdAt: new Date(2024, 0, (i % 28) + 1, 12),
          description: `Tx ${i}`,
          amount: -1 * (i + 1),
          isPending: false,
          category: { name: "Dining" },
        })),
      );

      await sendPlaidSyncSummaryEmail({
        userId: 1,
        itemId: undefined,
        registers: [
          {
            accountRegisterId: 1,
            name: "Checking",
            newCount: 22,
            updatedCount: 0,
            newRecords,
          },
        ],
      });

      const body = (postmarkClient.sendEmail as any).mock.calls[0][0]
        .HtmlBody as string;
      expect(body).toContain("+ 2 more");
      expect(body).not.toContain("Tx 21");
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
