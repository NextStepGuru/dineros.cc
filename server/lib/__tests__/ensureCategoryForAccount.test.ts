import type { PrismaClient } from "@prisma/client";
import { describe, it, expect, vi } from "vitest";
import { ensureCategoryForAccount } from "../ensureCategoryForAccount";

function dbWith(findFirstOrThrow: ReturnType<typeof vi.fn>) {
  return {
    category: { findFirstOrThrow },
  } as Pick<PrismaClient, "category">;
}

describe("ensureCategoryForAccount", () => {
  const accountId = "550e8400-e29b-41d4-a716-446655440000";
  const categoryId = "650e8400-e29b-41d4-a716-446655440001";

  it("no-ops when categoryId is null", async () => {
    const findFirstOrThrow = vi.fn();
    await ensureCategoryForAccount(dbWith(findFirstOrThrow), null, accountId);
    expect(findFirstOrThrow).not.toHaveBeenCalled();
  });

  it("no-ops when categoryId is undefined", async () => {
    const findFirstOrThrow = vi.fn();
    await ensureCategoryForAccount(
      dbWith(findFirstOrThrow),
      undefined,
      accountId,
    );
    expect(findFirstOrThrow).not.toHaveBeenCalled();
  });

  it("validates category belongs to account when categoryId is set", async () => {
    const findFirstOrThrow = vi.fn().mockResolvedValue({ id: categoryId });
    await ensureCategoryForAccount(
      dbWith(findFirstOrThrow),
      categoryId,
      accountId,
    );
    expect(findFirstOrThrow).toHaveBeenCalledWith({
      where: {
        id: categoryId,
        accountId,
        isArchived: false,
      },
    });
  });
});
