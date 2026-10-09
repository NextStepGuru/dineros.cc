import { describe, it, expect } from "vitest";
import { PlaidSyncDetailCollector } from "../PlaidSyncDetailCollector";

const row = (overrides: Partial<{ accountRegisterId: number }> = {}) => ({
  accountRegisterId: 1,
  name: "Checking",
  newCount: 1,
  updatedCount: 1,
  ...overrides,
});

describe("PlaidSyncDetailCollector", () => {
  describe("recordNew", () => {
    it("records new entries per register", () => {
      const collector = new PlaidSyncDetailCollector();
      collector.recordNew(1, "entry-a");
      collector.recordNew(1, "entry-b");
      collector.recordNew(2, "entry-c");

      const rows = collector.attachToRows([row(), row({ accountRegisterId: 2 })]);
      expect(rows[0].newRecords).toEqual([
        { registerId: 1, entryId: "entry-a" },
        { registerId: 1, entryId: "entry-b" },
      ]);
      expect(rows[1].newRecords).toEqual([
        { registerId: 2, entryId: "entry-c" },
      ]);
    });

    it("dedupes repeated entry ids", () => {
      const collector = new PlaidSyncDetailCollector();
      collector.recordNew(1, "entry-a");
      collector.recordNew(1, "entry-a");

      const rows = collector.attachToRows([row()]);
      expect(rows[0].newRecords).toHaveLength(1);
    });

    it("ignores empty entry ids", () => {
      const collector = new PlaidSyncDetailCollector();
      collector.recordNew(1, "");

      const rows = collector.attachToRows([row()]);
      expect(rows[0].newRecords).toBeUndefined();
    });
  });

  describe("recordUpdate", () => {
    it("merges notes when the same entry is updated twice", () => {
      const collector = new PlaidSyncDetailCollector();
      collector.recordUpdate(1, "entry-a", "Pending transaction posted");
      collector.recordUpdate(1, "entry-a", "Pending transaction posted");
      collector.recordUpdate(1, "entry-a", "Amount changed -$1.00 → -$2.00");

      const rows = collector.attachToRows([row()]);
      expect(rows[0].updatedRecords).toEqual([
        {
          registerId: 1,
          entryId: "entry-a",
          note: "Pending transaction posted; Amount changed -$1.00 → -$2.00",
        },
      ]);
    });

    it("keeps separate registers separate", () => {
      const collector = new PlaidSyncDetailCollector();
      collector.recordUpdate(1, "entry-a", "Matched bank transaction (exact)");

      const rows = collector.attachToRows([row(), row({ accountRegisterId: 2 })]);
      expect(rows[0].updatedRecords).toHaveLength(1);
      expect(rows[1].updatedRecords).toBeUndefined();
    });
  });

  describe("recordCategoryChange", () => {
    it("records the change", () => {
      const collector = new PlaidSyncDetailCollector();
      collector.recordCategoryChange({
        registerId: 1,
        entryId: "entry-a",
        fromCategoryId: null,
        toCategoryId: "cat-1",
        source: "ai",
      });

      const rows = collector.attachToRows([row()]);
      expect(rows[0].categoryChanges).toEqual([
        {
          registerId: 1,
          entryId: "entry-a",
          fromCategoryId: null,
          toCategoryId: "cat-1",
          source: "ai",
        },
      ]);
    });

    it("keeps the first from-category when an entry changes twice", () => {
      const collector = new PlaidSyncDetailCollector();
      collector.recordCategoryChange({
        registerId: 1,
        entryId: "entry-a",
        fromCategoryId: null,
        toCategoryId: "cat-1",
        source: "ai",
      });
      collector.recordCategoryChange({
        registerId: 1,
        entryId: "entry-a",
        fromCategoryId: "cat-1",
        toCategoryId: "cat-2",
        source: "rule",
      });

      const rows = collector.attachToRows([row()]);
      expect(rows[0].categoryChanges).toEqual([
        {
          registerId: 1,
          entryId: "entry-a",
          fromCategoryId: null,
          toCategoryId: "cat-2",
          source: "rule",
        },
      ]);
    });
  });

  describe("attachToRows", () => {
    it("returns rows untouched when nothing was recorded", () => {
      const collector = new PlaidSyncDetailCollector();
      const rows = [row()];
      expect(collector.attachToRows(rows)).toBe(rows);
    });

    it("leaves registers without records untouched", () => {
      const collector = new PlaidSyncDetailCollector();
      collector.recordNew(9, "entry-x");

      const untouched = row();
      const rows = collector.attachToRows([untouched]);
      expect(rows[0]).toBe(untouched);
    });
  });
});
