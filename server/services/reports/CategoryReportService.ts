import { createError } from "h3";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { dateTimeService } from "~/server/services/forecast";
import type {
  CategoryReportQuery,
  CategoryReportResponse,
  CategoryReportRow,
  CategoryReportTableGroup,
} from "./types";

const TRANSFER_TYPE_ID = 6;
const UNCATEGORIZED_ID = "__uncategorized__";

/** Category id → name + parent link (exported for unit tests). */
export type CategoryMetaMap = Map<
  string,
  { name: string; subCategoryId: string | null }
>;

function hueForKey(key: string): string {
  let h = 0;
  for (const ch of key) {
    h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  }
  return `hsl(${h % 360} 58% 48%)`;
}

export function rootCategoryId(meta: CategoryMetaMap, id: string): string {
  let cur = id;
  const seen = new Set<string>();
  while (true) {
    if (seen.has(cur)) return id;
    seen.add(cur);
    const m = meta.get(cur);
    if (!m?.subCategoryId) return cur;
    cur = m.subCategoryId;
  }
}

/** Root → … → leaf names (for donut / full path label). */
export function categoryPathNames(
  meta: CategoryMetaMap,
  id: string,
): string[] {
  const names: string[] = [];
  let cur: string | null = id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const row = meta.get(cur);
    if (!row) break;
    names.unshift(row.name);
    cur = row.subCategoryId;
  }
  return names;
}

function applyShareOfAbs(rows: CategoryReportRow[], sumAbs: number): void {
  for (const row of rows) {
    row.shareOfAbs =
      sumAbs > 0
        ? Math.round((Math.abs(row.total) / sumAbs) * 10000) / 100
        : 0;
  }
}

function buildDetailRow(
  meta: CategoryMetaMap,
  key: string,
  agg: { total: number; count: number },
): CategoryReportRow {
  const m = meta.get(key);
  const leafName = m?.name ?? "Unknown category";
  const pid = m?.subCategoryId ?? null;
  const pName = pid ? (meta.get(pid)?.name ?? null) : null;
  const pathNames = categoryPathNames(meta, key);
  const segmentLabel =
    pathNames.length > 1 ? pathNames.join(" › ") : leafName;
  return {
    categoryId: key,
    parentCategoryId: pid,
    parentName: pName,
    name: leafName,
    segmentLabel,
    total: Math.round(agg.total * 100) / 100,
    count: agg.count,
    shareOfAbs: 0,
    color: hueForKey(segmentLabel),
  };
}

export function buildDonutCategories(
  rollupBuckets: Map<string, { total: number; count: number }>,
  meta: CategoryMetaMap,
  sumAbs: number,
): CategoryReportRow[] {
  const donutCategories: CategoryReportRow[] = [];
  for (const [key, agg] of rollupBuckets) {
    if (key === UNCATEGORIZED_ID) {
      donutCategories.push({
        categoryId: null,
        parentCategoryId: null,
        parentName: null,
        name: "Uncategorized",
        segmentLabel: "Uncategorized",
        total: Math.round(agg.total * 100) / 100,
        count: agg.count,
        shareOfAbs: 0,
        color: hueForKey(key),
      });
      continue;
    }
    const rootName = meta.get(key)?.name ?? "Unknown category";
    donutCategories.push({
      categoryId: key,
      parentCategoryId: null,
      parentName: null,
      name: rootName,
      segmentLabel: rootName,
      total: Math.round(agg.total * 100) / 100,
      count: agg.count,
      shareOfAbs: 0,
      color: hueForKey(key),
    });
  }
  applyShareOfAbs(donutCategories, sumAbs);
  donutCategories.sort((a, b) => {
    if (a.categoryId == null) return 1;
    if (b.categoryId == null) return -1;
    return (
      Math.abs(b.total) - Math.abs(a.total) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  });
  return donutCategories;
}

export function sortRootIdsByRollup(
  rootIds: string[],
  rollupBuckets: Map<string, { total: number; count: number }>,
  meta: CategoryMetaMap,
): string[] {
  return [...rootIds].sort((a, b) => {
    const ta = Math.abs(rollupBuckets.get(a)?.total ?? 0);
    const tb = Math.abs(rollupBuckets.get(b)?.total ?? 0);
    if (tb !== ta) return tb - ta;
    return (meta.get(a)?.name ?? "").localeCompare(
      meta.get(b)?.name ?? "",
      undefined,
      { sensitivity: "base" },
    );
  });
}

export function buildTableGroups(
  rootIds: string[],
  rollupBuckets: Map<string, { total: number; count: number }>,
  buckets: Map<string, { total: number; count: number }>,
  meta: CategoryMetaMap,
  showSubcategories: boolean,
  sumAbs: number,
): CategoryReportTableGroup[] {
  const tableGroups: CategoryReportTableGroup[] = [];

  for (const root of rootIds) {
    const rollup = rollupBuckets.get(root);
    if (!rollup) continue;
    const rootName = meta.get(root)?.name ?? "Unknown category";
    const parentRow: CategoryReportRow = {
      categoryId: root,
      parentCategoryId: null,
      parentName: null,
      name: rootName,
      segmentLabel: rootName,
      total: Math.round(rollup.total * 100) / 100,
      count: rollup.count,
      shareOfAbs: 0,
      color: hueForKey(root),
    };

    const children: CategoryReportRow[] = [];
    if (showSubcategories) {
      const childKeys = [...buckets.keys()].filter(
        (k) =>
          k !== UNCATEGORIZED_ID &&
          rootCategoryId(meta, k) === root &&
          k !== root,
      );
      childKeys.sort((a, b) =>
        (meta.get(a)?.name ?? "").localeCompare(
          meta.get(b)?.name ?? "",
          undefined,
          { sensitivity: "base" },
        ),
      );
      for (const ck of childKeys) {
        const ba = buckets.get(ck);
        if (ba) children.push(buildDetailRow(meta, ck, ba));
      }
    }

    applyShareOfAbs([parentRow, ...children], sumAbs);
    tableGroups.push({ parent: parentRow, children });
  }

  const uncategorized = buckets.get(UNCATEGORIZED_ID);
  if (uncategorized) {
    const parentRow: CategoryReportRow = {
      categoryId: null,
      parentCategoryId: null,
      parentName: null,
      name: "Uncategorized",
      segmentLabel: "Uncategorized",
      total: Math.round(uncategorized.total * 100) / 100,
      count: uncategorized.count,
      shareOfAbs: 0,
      color: hueForKey(UNCATEGORIZED_ID),
    };
    applyShareOfAbs([parentRow], sumAbs);
    tableGroups.push({ parent: parentRow, children: [] });
  }

  return tableGroups;
}

function utcDayStart(isoDate: string): Date {
  return dateTimeService.createUTC(`${isoDate}T00:00:00.000Z`).toDate();
}

function utcDayEnd(isoDate: string): Date {
  return dateTimeService.createUTC(`${isoDate}T23:59:59.999Z`).toDate();
}

/** Normalizes `dateTo` when inverted or still out of range (exported for unit tests). */
export function resolveCategoryReportDateRange(
  dateFrom: string,
  dateTo: string,
): { dateTo: string } {
  let resolvedDateTo = dateTo;
  if (resolvedDateTo < dateFrom) {
    resolvedDateTo = dateTimeService
      .createUTC(`${resolvedDateTo}T00:00:00.000Z`)
      .add(1, "day")
      .format("YYYY-MM-DD");
  }
  if (utcDayStart(dateFrom).getTime() > utcDayEnd(resolvedDateTo).getTime()) {
    resolvedDateTo = dateFrom;
  }
  return { dateTo: resolvedDateTo };
}

/** Match legacy interest sign correction from `server/api/register.ts` */
function toAmount(
  entry: {
    amount: unknown;
    typeId?: number | null;
    description?: string;
  },
  isCredit: boolean,
): number {
  const n = Number(entry.amount);
  const isLegacyInterest =
    isCredit &&
    n > 0 &&
    (entry.typeId === 2 || entry.description === "Interest Charge");
  if (isLegacyInterest) return -n;
  return n;
}

function pastDirectionFilter(focusedAt: Date) {
  return {
    OR: [
      { isCleared: true },
      { isReconciled: true },
      {
        isPending: false,
        isProjected: false,
        isCleared: false,
        createdAt: { lte: focusedAt },
      },
    ],
  };
}

function futureDirectionFilter() {
  return {
    OR: [
      { isCleared: false, isProjected: true },
      { isProjected: false, isCleared: false, isPending: true },
      { isProjected: false, isManualEntry: true, isCleared: false },
    ],
  };
}

async function ensureCategoryReportAccess(
  userId: number,
  budgetId: number,
  registerBaseWhere: object,
): Promise<void> {
  const budget = await PrismaDb.budget.findFirst({
    where: {
      id: budgetId,
      isArchived: false,
      account: {
        userAccounts: { some: { userId } },
      },
    },
    select: { id: true },
  });
  if (!budget) {
    throw createError({
      statusCode: 404,
      statusMessage: "Budget not found",
    });
  }
  const registerCount = await PrismaDb.accountRegister.count({
    where: registerBaseWhere,
  });
  if (registerCount === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: "No account registers match this filter",
    });
  }
}

async function loadRegisterEntriesForCategoryReport(params: {
  start: Date;
  end: Date;
  mode: "past" | "future";
  registerBaseWhere: object;
  includeTransfers: boolean;
}) {
  const { start, end, mode, registerBaseWhere, includeTransfers } = params;
  const dateRange = { gte: start, lte: end };
  const directionWhere =
    mode === "past" ? pastDirectionFilter(end) : futureDirectionFilter();
  const transferFilter = includeTransfers
    ? {}
    : {
        NOT: {
          OR: [
            { typeId: TRANSFER_TYPE_ID },
            { sourceAccountRegisterId: { not: null } },
          ],
        },
      };

  return PrismaDb.registerEntry.findMany({
    where: {
      AND: [
        { createdAt: dateRange },
        directionWhere,
        { isBalanceEntry: false },
        { register: registerBaseWhere },
        transferFilter,
      ],
    },
    select: {
      amount: true,
      typeId: true,
      description: true,
      categoryId: true,
      register: {
        select: {
          type: { select: { isCredit: true } },
        },
      },
    },
  });
}

export async function getCategoryReport(params: {
  userId: number;
  query: CategoryReportQuery;
}): Promise<CategoryReportResponse> {
  const { userId } = params;
  const {
    budgetId,
    accountRegisterId: rawRegisterId,
    mode,
    dateFrom,
    dateTo,
    includeTransfers,
    showSubcategories,
  } = params.query;

  const { dateTo: resolvedDateTo } = resolveCategoryReportDateRange(
    dateFrom,
    dateTo,
  );

  const start = utcDayStart(dateFrom);
  const end = utcDayEnd(resolvedDateTo);

  const scopedRegisterId =
    rawRegisterId != null && rawRegisterId > 0 ? rawRegisterId : null;

  const registerBaseWhere = {
    budgetId,
    isArchived: false,
    account: {
      userAccounts: { some: { userId } },
    },
    ...(scopedRegisterId == null ? {} : { id: scopedRegisterId }),
  };

  await ensureCategoryReportAccess(userId, budgetId, registerBaseWhere);

  const entries = await loadRegisterEntriesForCategoryReport({
    start,
    end,
    mode,
    registerBaseWhere,
    includeTransfers,
  });

  const buckets = new Map<string, { total: number; count: number }>();
  for (const e of entries) {
    const isCredit = e.register.type.isCredit;
    const amt = toAmount(e, isCredit);
    const key = e.categoryId ?? UNCATEGORIZED_ID;
    const cur = buckets.get(key) ?? { total: 0, count: 0 };
    cur.total += amt;
    cur.count += 1;
    buckets.set(key, cur);
  }

  const allCategories = await PrismaDb.category.findMany({
    where: {
      isArchived: false,
      account: { userAccounts: { some: { userId } } },
    },
    select: { id: true, name: true, subCategoryId: true },
  });
  const meta: CategoryMetaMap = new Map(
    allCategories.map((c) => [
      c.id,
      { name: c.name, subCategoryId: c.subCategoryId },
    ]),
  );

  let totalIn = 0;
  let totalOut = 0;
  let sumAbs = 0;
  let transactionCount = 0;
  for (const [, { total, count }] of buckets) {
    transactionCount += count;
    if (total > 0) totalIn += total;
    if (total < 0) totalOut += total;
    sumAbs += Math.abs(total);
  }

  const rollupBuckets = new Map<string, { total: number; count: number }>();
  for (const [key, agg] of buckets) {
    if (key === UNCATEGORIZED_ID) {
      rollupBuckets.set(key, { total: agg.total, count: agg.count });
      continue;
    }
    const root = rootCategoryId(meta, key);
    const cur = rollupBuckets.get(root) ?? { total: 0, count: 0 };
    cur.total += agg.total;
    cur.count += agg.count;
    rollupBuckets.set(root, cur);
  }

  const donutCategories = buildDonutCategories(rollupBuckets, meta, sumAbs);

  const rootIds = sortRootIdsByRollup(
    [
      ...new Set(
        [...buckets.keys()]
          .filter((k) => k !== UNCATEGORIZED_ID)
          .map((k) => rootCategoryId(meta, k)),
      ),
    ],
    rollupBuckets,
    meta,
  );

  const tableGroups = buildTableGroups(
    rootIds,
    rollupBuckets,
    buckets,
    meta,
    showSubcategories,
    sumAbs,
  );

  const net = Math.round((totalIn + totalOut) * 100) / 100;

  return {
    mode,
    dateFrom,
    dateTo: resolvedDateTo,
    budgetId,
    accountRegisterId: scopedRegisterId,
    includeTransfers,
    showSubcategories,
    summary: {
      totalIn: Math.round(totalIn * 100) / 100,
      totalOut: Math.round(totalOut * 100) / 100,
      net,
      transactionCount,
      sumAbs: Math.round(sumAbs * 100) / 100,
    },
    donutCategories,
    tableGroups,
  };
}
