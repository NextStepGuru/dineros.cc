import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { dateTimeService } from "~/server/services/forecast/DateTimeService";
import { prisma } from "~/server/clients/prismaClient";
import { markPlaidItemReauthRequired } from "../plaidReauthService";

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("~/server/services/PlaidSyncNotificationService", () => ({
  sendPlaidConnectionIssueEmailIfEligible: vi.fn(),
}));

describe("plaidReauthService", () => {
  beforeAll(() => {
    // Deterministic dateTimeService.toISOString()
    dateTimeService.setNowOverride(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterAll(() => {
    dateTimeService.clearNowOverride();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when the plaid item is unknown", async () => {
    (prisma.plaidItem.findUnique as any).mockResolvedValue(null);

    await markPlaidItemReauthRequired({ itemId: "item-missing", reason: "ERROR" });

    expect(prisma.plaidItem.findUnique).toHaveBeenCalledWith({
      where: { itemId: "item-missing" },
      select: { userId: true },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("does nothing when the owning user is missing", async () => {
    (prisma.plaidItem.findUnique as any).mockResolvedValue({ userId: 5 });
    (prisma.user.findUnique as any).mockResolvedValue(null);

    await markPlaidItemReauthRequired({ itemId: "item-1", reason: "ERROR" });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("marks reauth_required without an email timestamp when no email is sent", async () => {
    (prisma.plaidItem.findUnique as any).mockResolvedValue({ userId: 5 });
    (prisma.user.findUnique as any).mockResolvedValue({ id: 5, settings: {} });

    const { sendPlaidConnectionIssueEmailIfEligible } = await import(
      "~/server/services/PlaidSyncNotificationService"
    );
    const { log } = await import("~/server/logger");
    (sendPlaidConnectionIssueEmailIfEligible as any).mockResolvedValue(false);

    await markPlaidItemReauthRequired({ itemId: "item-1", reason: "ERROR" });

    expect(sendPlaidConnectionIssueEmailIfEligible).toHaveBeenCalledWith({
      userId: 5,
      itemId: "item-1",
      webhookCode: "ERROR",
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: {
        settings: {
          plaid: { reauth_required: true },
        },
      },
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Marked Plaid item as requiring re-authentication",
        level: "warn",
        data: { itemId: "item-1", userId: 5, reason: "ERROR" },
      }),
    );
  });

  it("records lastConnectionIssueEmailAt when the notification email was sent", async () => {
    (prisma.plaidItem.findUnique as any).mockResolvedValue({ userId: 5 });
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 5,
      settings: { plaid: { isEnabled: true } },
    });

    const { sendPlaidConnectionIssueEmailIfEligible } = await import(
      "~/server/services/PlaidSyncNotificationService"
    );
    (sendPlaidConnectionIssueEmailIfEligible as any).mockResolvedValue(true);

    await markPlaidItemReauthRequired({
      itemId: "item-1",
      reason: "LOGIN_REQUIRED",
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: {
        settings: {
          plaid: {
            isEnabled: true,
            reauth_required: true,
            lastConnectionIssueEmailAt: "2024-01-01T00:00:00.000Z",
          },
        },
      },
    });
  });

  it("preserves unrelated settings keys while marking the item", async () => {
    (prisma.plaidItem.findUnique as any).mockResolvedValue({ userId: 5 });
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 5,
      settings: { theme: "dark", other: 1, plaid: { isEnabled: true } },
    });

    const { sendPlaidConnectionIssueEmailIfEligible } = await import(
      "~/server/services/PlaidSyncNotificationService"
    );
    (sendPlaidConnectionIssueEmailIfEligible as any).mockResolvedValue(false);

    await markPlaidItemReauthRequired({ itemId: "item-1", reason: "ERROR" });

    const updateArg = (prisma.user.update as any).mock.calls[0][0];
    expect(updateArg.data.settings.theme).toBe("dark");
    expect(updateArg.data.settings.other).toBe(1);
    expect(updateArg.data.settings.plaid).toEqual({
      isEnabled: true,
      reauth_required: true,
    });
  });

  it("handles user rows without settings", async () => {
    (prisma.plaidItem.findUnique as any).mockResolvedValue({ userId: 5 });
    (prisma.user.findUnique as any).mockResolvedValue({ id: 5 });

    const { sendPlaidConnectionIssueEmailIfEligible } = await import(
      "~/server/services/PlaidSyncNotificationService"
    );
    (sendPlaidConnectionIssueEmailIfEligible as any).mockResolvedValue(false);

    await markPlaidItemReauthRequired({ itemId: "item-1", reason: "ERROR" });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: {
        settings: {
          plaid: { reauth_required: true },
        },
      },
    });
  });

  it("does not mutate the stored user settings object in place", async () => {
    const storedSettings = { plaid: { isEnabled: true } };
    (prisma.plaidItem.findUnique as any).mockResolvedValue({ userId: 5 });
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 5,
      settings: storedSettings,
    });

    const { sendPlaidConnectionIssueEmailIfEligible } = await import(
      "~/server/services/PlaidSyncNotificationService"
    );
    (sendPlaidConnectionIssueEmailIfEligible as any).mockResolvedValue(false);

    await markPlaidItemReauthRequired({ itemId: "item-1", reason: "ERROR" });

    expect(storedSettings.plaid).toEqual({ isEnabled: true });
  });
});
