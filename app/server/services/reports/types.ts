import { z } from "zod";

export const categoryReportQuerySchema = z.object({
  budgetId: z.coerce.number().int().positive(),
  /** Omit or `0` = all registers in the budget */
  accountRegisterId: z.coerce.number().int().nonnegative().optional(),
  mode: z.enum(["past", "future"]),
  /** Inclusive start, ISO date `YYYY-MM-DD` (UTC start-of-day) */
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Inclusive end, ISO date `YYYY-MM-DD` (UTC end-of-day) */
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  includeTransfers: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),
  /** When true (default), one row per category including subcategories; when false, roll up to parent. */
  showSubcategories: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),
});

export type CategoryReportQuery = z.infer<typeof categoryReportQuerySchema>;

export type CategoryReportRow = {
  categoryId: string | null;
  /** Immediate parent id when this row is a subcategory */
  parentCategoryId: string | null;
  /** Parent category display name; null for top-level or rollup rows */
  parentName: string | null;
  /** Leaf / own category name (not combined with parent) */
  name: string;
  /** Donut & compact legend (e.g. `Food › Groceries` or `Food`) */
  segmentLabel: string;
  total: number;
  count: number;
  shareOfAbs: number;
  color: string;
};

/** Parent summary row + detail rows that roll up under that parent. */
export type CategoryReportTableGroup = {
  parent: CategoryReportRow;
  children: CategoryReportRow[];
};

export type CategoryReportResponse = {
  mode: "past" | "future";
  dateFrom: string;
  dateTo: string;
  budgetId: number;
  accountRegisterId: number | null;
  includeTransfers: boolean;
  showSubcategories: boolean;
  summary: {
    totalIn: number;
    totalOut: number;
    net: number;
    transactionCount: number;
    sumAbs: number;
  };
  /** Donut segments: top-level (root) category totals only */
  donutCategories: CategoryReportRow[];
  /** Table: each parent total then subcategory lines underneath */
  tableGroups: CategoryReportTableGroup[];
};
