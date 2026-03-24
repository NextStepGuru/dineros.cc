import { describe, it, expect, vi, beforeEach } from "vitest";
import { cloneCategoriesForAccount } from "../categoryCloneService";

function createMockTx() {
  const category = {
    findMany: vi.fn(),
    create: vi.fn().mockResolvedValue({}),
  };
  return { tx: { category }, category };
}

describe("categoryCloneService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty map when no categories", async () => {
    const { tx, category } = createMockTx();
    category.findMany.mockResolvedValue([]);

    const map = await cloneCategoriesForAccount(tx as any, "src", "tgt");

    expect(map.size).toBe(0);
    expect(category.create).not.toHaveBeenCalled();
  });

  it("inserts parents before children and remaps subCategoryId", async () => {
    const { tx, category } = createMockTx();
    const parentId = "p0000000-0000-4000-8000-000000000001";
    const childId = "c0000000-0000-4000-8000-000000000002";
    category.findMany.mockResolvedValue([
      {
        id: parentId,
        accountId: "src",
        name: "Parent",
        isArchived: false,
        subCategoryId: null,
      },
      {
        id: childId,
        accountId: "src",
        name: "Child",
        isArchived: false,
        subCategoryId: parentId,
      },
    ]);

    const map = await cloneCategoriesForAccount(tx as any, "src", "tgt");

    expect(category.create).toHaveBeenCalledTimes(2);
    const first = category.create.mock.calls[0]![0].data;
    const second = category.create.mock.calls[1]![0].data;
    expect(first.subCategoryId).toBeNull();
    expect(first.accountId).toBe("tgt");
    expect(second.subCategoryId).toBe(first.id);
    expect(map.get(parentId)).toBe(first.id);
    expect(map.get(childId)).toBe(second.id);
  });

  it("throws on cycle or missing parent", async () => {
    const { tx, category } = createMockTx();
    const a = "a0000000-0000-4000-8000-000000000001";
    const b = "b0000000-0000-4000-8000-000000000002";
    category.findMany.mockResolvedValue([
      {
        id: a,
        accountId: "src",
        name: "A",
        isArchived: false,
        subCategoryId: b,
      },
      {
        id: b,
        accountId: "src",
        name: "B",
        isArchived: false,
        subCategoryId: a,
      },
    ]);

    await expect(
      cloneCategoriesForAccount(tx as any, "src", "tgt"),
    ).rejects.toThrow(
      "Category clone: cycle or missing parent in category tree for account",
    );
  });
});
