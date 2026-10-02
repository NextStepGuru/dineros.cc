import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~/server/clients/prismaClient";
import { plaidIsActiveForUser } from "../plaidUserAccess";

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

describe("plaidUserAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true immediately when settings.plaid.isEnabled is set", async () => {
    const user = { settings: { plaid: { isEnabled: true } } } as any;

    const result = await plaidIsActiveForUser(7, user);

    expect(result).toBe(true);
    expect(prisma.plaidItem.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to the plaidItem table when the settings flag is unset", async () => {
    const user = { settings: { plaid: { isEnabled: false } } } as any;
    (prisma.plaidItem.findFirst as any).mockResolvedValue({
      itemId: "item-1",
    });

    const result = await plaidIsActiveForUser(7, user);

    expect(result).toBe(true);
    expect(prisma.plaidItem.findFirst).toHaveBeenCalledWith({
      where: { userId: 7 },
      select: { itemId: true },
    });
  });

  it("returns false when the settings flag is unset and no plaidItem exists", async () => {
    const user = { settings: { plaid: {} } } as any;
    (prisma.plaidItem.findFirst as any).mockResolvedValue(null);

    const result = await plaidIsActiveForUser(7, user);

    expect(result).toBe(false);
  });

  it("queries the plaidItem table only for the given user", async () => {
    const user = { settings: { plaid: { isEnabled: false } } } as any;
    (prisma.plaidItem.findFirst as any).mockResolvedValue(null);

    await plaidIsActiveForUser(42, user);

    const whereArg = (prisma.plaidItem.findFirst as any).mock.calls[0][0].where;
    expect(whereArg).toEqual({ userId: 42 });
  });
});
