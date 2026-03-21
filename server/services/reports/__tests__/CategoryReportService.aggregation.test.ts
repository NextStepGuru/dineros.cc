import { describe, it, expect } from "vitest";
import {
  rootCategoryId,
  categoryPathNames,
  buildDonutCategories,
  buildTableGroups,
  sortRootIdsByRollup,
  type CategoryMetaMap,
} from "../CategoryReportService";

const UNCATEGORIZED_ID = "__uncategorized__";

function metaFromRows(
  rows: Array<{ id: string; name: string; subCategoryId: string | null }>,
): CategoryMetaMap {
  return new Map(rows.map((r) => [r.id, { name: r.name, subCategoryId: r.subCategoryId }]));
}

describe("rootCategoryId", () => {
  it("walks to the root when subCategoryId chain exists", () => {
    const meta = metaFromRows([
      { id: "leaf", name: "Leaf", subCategoryId: "mid" },
      { id: "mid", name: "Mid", subCategoryId: "root" },
      { id: "root", name: "Root", subCategoryId: null },
    ]);
    expect(rootCategoryId(meta, "leaf")).toBe("root");
    expect(rootCategoryId(meta, "mid")).toBe("root");
    expect(rootCategoryId(meta, "root")).toBe("root");
  });

  it("returns the starting id when already a root", () => {
    const meta = metaFromRows([
      { id: "solo", name: "Solo", subCategoryId: null },
    ]);
    expect(rootCategoryId(meta, "solo")).toBe("solo");
  });

  it("breaks cycles by returning the original id", () => {
    const meta = metaFromRows([
      { id: "a", name: "A", subCategoryId: "b" },
      { id: "b", name: "B", subCategoryId: "a" },
    ]);
    expect(rootCategoryId(meta, "a")).toBe("a");
  });
});

describe("categoryPathNames", () => {
  it("returns root-to-leaf names joined for segment labels elsewhere", () => {
    const meta = metaFromRows([
      { id: "leaf", name: "Groceries", subCategoryId: "food" },
      { id: "food", name: "Food", subCategoryId: null },
    ]);
    expect(categoryPathNames(meta, "leaf")).toEqual(["Food", "Groceries"]);
  });

  it("returns a single name for a root category", () => {
    const meta = metaFromRows([
      { id: "food", name: "Food", subCategoryId: null },
    ]);
    expect(categoryPathNames(meta, "food")).toEqual(["Food"]);
  });
});

describe("sortRootIdsByRollup", () => {
  it("orders by absolute total descending, then name", () => {
    const meta = metaFromRows([
      { id: "a", name: "Alpha", subCategoryId: null },
      { id: "b", name: "Bravo", subCategoryId: null },
    ]);
    const rollup = new Map<string, { total: number; count: number }>([
      ["a", { total: 10, count: 1 }],
      ["b", { total: -50, count: 2 }],
    ]);
    expect(sortRootIdsByRollup(["a", "b"], rollup, meta)).toEqual(["b", "a"]);
  });
});

describe("buildDonutCategories", () => {
  it("builds uncategorized slice and root slices with shareOfAbs", () => {
    const meta = metaFromRows([
      { id: "r1", name: "Food", subCategoryId: null },
      { id: "r2", name: "Auto", subCategoryId: null },
    ]);
    const rollup = new Map<string, { total: number; count: number }>([
      [UNCATEGORIZED_ID, { total: -25, count: 1 }],
      ["r1", { total: 100, count: 3 }],
      ["r2", { total: -75, count: 2 }],
    ]);
    const sumAbs = 25 + 100 + 75;
    const donut = buildDonutCategories(rollup, meta, sumAbs);
    const unc = donut.find((d) => d.categoryId === null);
    const food = donut.find((d) => d.categoryId === "r1");
    expect(unc?.name).toBe("Uncategorized");
    expect(unc?.shareOfAbs).toBeCloseTo((25 / sumAbs) * 100, 5);
    expect(food?.segmentLabel).toBe("Food");
    expect(food?.shareOfAbs).toBeCloseTo((100 / sumAbs) * 100, 5);
    expect(donut[0].categoryId).not.toBeNull();
    expect(donut[donut.length - 1].categoryId).toBeNull();
  });
});

describe("buildTableGroups", () => {
  it("includes parent rollup and optional child detail rows", () => {
    const meta = metaFromRows([
      { id: "root", name: "Food", subCategoryId: null },
      { id: "child", name: "Groceries", subCategoryId: "root" },
    ]);
    const buckets = new Map<string, { total: number; count: number }>([
      ["child", { total: 40, count: 2 }],
    ]);
    const rollup = new Map<string, { total: number; count: number }>([
      ["root", { total: 40, count: 2 }],
    ]);
    const sumAbs = 40;

    const withChildren = buildTableGroups(
      ["root"],
      rollup,
      buckets,
      meta,
      true,
      sumAbs,
    );
    expect(withChildren).toHaveLength(1);
    expect(withChildren[0].parent.name).toBe("Food");
    expect(withChildren[0].children).toHaveLength(1);
    expect(withChildren[0].children[0].segmentLabel).toBe("Food › Groceries");
    expect(withChildren[0].children[0].shareOfAbs).toBe(100);

    const flat = buildTableGroups(
      ["root"],
      rollup,
      buckets,
      meta,
      false,
      sumAbs,
    );
    expect(flat[0].children).toHaveLength(0);
  });

  it("appends uncategorized as its own group", () => {
    const meta = metaFromRows([
      { id: "root", name: "Food", subCategoryId: null },
    ]);
    const buckets = new Map<string, { total: number; count: number }>([
      ["root", { total: 10, count: 1 }],
      [UNCATEGORIZED_ID, { total: -5, count: 1 }],
    ]);
    const rollup = new Map<string, { total: number; count: number }>([
      ["root", { total: 10, count: 1 }],
      [UNCATEGORIZED_ID, { total: -5, count: 1 }],
    ]);
    const groups = buildTableGroups(
      ["root"],
      rollup,
      buckets,
      meta,
      false,
      15,
    );
    expect(groups).toHaveLength(2);
    expect(groups[1].parent.name).toBe("Uncategorized");
    expect(groups[1].parent.categoryId).toBeNull();
  });
});
