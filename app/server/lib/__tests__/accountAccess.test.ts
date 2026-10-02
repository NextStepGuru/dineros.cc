import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

// eslint-disable-next-line import/first -- mocks must be registered first
import { prisma } from "~/server/clients/prismaClient";
// eslint-disable-next-line import/first -- mocks must be registered first
import {
  accountWhereUserIsMember,
  assertUserHasAccountAccess,
  budgetWhereForAccountMember,
} from "../accountAccess";

describe("accountAccess where-builders", () => {
  it("builds a userAccounts membership filter", () => {
    expect(accountWhereUserIsMember(7)).toEqual({
      userAccounts: { some: { userId: 7 } },
    });
  });

  it("requires budget visibility in the budget membership filter", () => {
    expect(budgetWhereForAccountMember(7, 99)).toEqual({
      id: 99,
      isArchived: false,
      account: {
        userAccounts: { some: { userId: 7, canViewBudgets: true } },
      },
    });
  });
});

describe("assertUserHasAccountAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes silently when a UserAccount link exists", async () => {
    (prisma.userAccount.findFirst as any).mockResolvedValue({ id: 1 });

    await expect(
      assertUserHasAccountAccess(7, "acct-1"),
    ).resolves.toBeUndefined();

    expect(prisma.userAccount.findFirst).toHaveBeenCalledWith({
      where: { userId: 7, accountId: "acct-1" },
    });
  });

  it("throws 403 when the user has no link to the account", async () => {
    (prisma.userAccount.findFirst as any).mockResolvedValue(null);

    await expect(assertUserHasAccountAccess(7, "acct-1")).rejects.toMatchObject(
      { statusCode: 403 },
    );
  });
});
