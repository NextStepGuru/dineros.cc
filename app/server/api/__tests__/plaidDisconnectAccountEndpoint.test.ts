import { describe, it, expect, vi, beforeEach } from "vitest";
import { dbUserForSession } from "./fixtures/dbUserForSession";

vi.hoisted(() => {
  (globalThis as unknown as { defineEventHandler: typeof vi.fn }).defineEventHandler =
    vi.fn((handler: unknown) => handler);
  (globalThis as unknown as { readBody: ReturnType<typeof vi.fn> }).readBody =
    vi.fn();
});

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler: unknown) => handler),
  readBody: vi.fn(),
}));

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

vi.mock("~/server/lib/getPlaidClient", () => ({
  configuration: {},
}));

vi.mock("~/server/lib/plaidAccessTokenCrypto", () => ({
  resolvePlaidAccessTokenFromStored: (v: string | undefined) => v ?? null,
}));

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("plaid", () => ({
  PlaidApi: vi.fn(),
}));

describe("POST /api/plaid-disconnect-account", () => {
  let handler: (_event: Record<string, unknown>) => Promise<unknown>;
  let mockPlaidClient: { itemRemove: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    (globalThis as unknown as { readBody: ReturnType<typeof vi.fn> }).readBody.mockResolvedValue(
      {
        accountRegisterId: 10,
      },
    );

    mockPlaidClient = { itemRemove: vi.fn().mockResolvedValue({}) };
    const { PlaidApi } = await import("plaid");
    (
      PlaidApi as unknown as { mockImplementation: (_fn: unknown) => void }
    ).mockImplementation(() => mockPlaidClient);
    const mod = await import("../plaid-disconnect-account.post");
    handler = mod.default as typeof handler;
    const { getUser } = await import("~/server/lib/getUser");
    (getUser as ReturnType<typeof vi.fn>).mockReturnValue({ userId: 1 });
    const { prisma } = await import("~/server/clients/prismaClient");
    prisma.accountRegister.findFirstOrThrow.mockResolvedValue({
      id: 10,
      plaidId: "plaid-reg",
      plaidAccessToken: "token-from-register",
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue(dbUserForSession({ id: 1 }));
  });

  it("does not call Plaid itemRemove when another register still has Plaid linked", async () => {
    const { prisma } = await import("~/server/clients/prismaClient");
    prisma.accountRegister.count.mockResolvedValue(1);
    prisma.accountRegister.update.mockResolvedValue({});

    await handler({});

    expect(mockPlaidClient.itemRemove).not.toHaveBeenCalled();
    expect(prisma.accountRegister.update).toHaveBeenCalled();
  });

  it("calls itemRemove with access token when this is the last linked register", async () => {
    const { prisma } = await import("~/server/clients/prismaClient");
    prisma.accountRegister.count.mockResolvedValue(0);
    prisma.plaidItem.deleteMany.mockResolvedValue({ count: 0 });
    prisma.plaidSyncCursor.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.update.mockResolvedValue({});
    prisma.accountRegister.update.mockResolvedValue({});
    const base = dbUserForSession();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      ...base,
      settings: {
        ...base.settings,
        plaid: {
          isEnabled: true,
          item_id: "item-xyz",
          access_token: "fallback-token",
        },
      },
    });

    await handler({});

    expect(mockPlaidClient.itemRemove).toHaveBeenCalledWith({
      access_token: "token-from-register",
    });
    expect(prisma.user.update).toHaveBeenCalled();
  });
});
