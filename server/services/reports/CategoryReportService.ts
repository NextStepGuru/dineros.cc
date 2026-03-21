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

function hueForKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return `hsl(${h % 360} 58% 48%)`;
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

  const budget = await PrismaDb.budget.findFirst({
    where: {
      id: budgetId,
      userId,
      isArchived: false,
    },
    select: { id: true },
  });
  if (!budget) {
    throw createError({
      statusCode: 404,
      statusMessage: "Budget not found",
    });
  }

  const scopedRegisterId =
    rawRegisterId != null && rawRegisterId > 0 ? rawRegisterId : null;

  const registerBaseWhere = {
    budgetId,
    isArchived: false,
    account: {
      userAccounts: { some: { userId } },
    },
    ...(scopedRegisterId != null ? { id: scopedRegisterId } : {}),
  };

  const registerCount = await PrismaDb.accountRegister.count({
    where: registerBaseWhere,
  });
  if (registerCount === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: "No account registers match this filter",
    });
  }

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

  const entries = await PrismaDb.registerEntry.findMany({
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

  type CatMeta = { name: string; subCategoryId: string | null };
  const allCategories = await PrismaDb.category.findMany({
    where: {
      isArchived: false,
      account: { userAccounts: { some: { userId } } },
    },
    select: { id: true, name: true, subCategoryId: true },
  });
  const meta = new Map<string, CatMeta>(
    allCategories.map((c) => [
      c.id,
      { name: c.name, subCategoryId: c.subCategoryId },
    ]),
  );

  function rootCategoryId(id: string): string {
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
  function categoryPathNames(id: string): string[] {
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
    const root = rootCategoryId(key);
    const cur = rollupBuckets.get(root) ?? { total: 0, count: 0 };
    cur.total += agg.total;
    cur.count += agg.count;
    rollupBuckets.set(root, cur);
  }

  function applyShareOfAbs(rows: CategoryReportRow[]) {
    for (const row of rows) {
      row.shareOfAbs =
        sumAbs > 0
          ? Math.round((Math.abs(row.total) / sumAbs) * 10000) / 100
          : 0;
    }
  }

  function buildDetailRow(
    key: string,
    agg: { total: number; count: number },
  ): CategoryReportRow {
    const m = meta.get(key);
    const leafName = m?.name ?? "Unknown category";
    const pid = m?.subCategoryId ?? null;
    const pName = pid ? (meta.get(pid)?.name ?? null) : null;
    const pathNames = categoryPathNames(key);
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

  /** Donut: one segment per root rollup (+ uncategorized). */
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
  applyShareOfAbs(donutCategories);
  donutCategories.sort((a, b) => {
    if (a.categoryId == null) return 1;
    if (b.categoryId == null) return -1;
    return (
      Math.abs(b.total) - Math.abs(a.total) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  });

  const rootIds = [
    ...new Set(
      [...buckets.keys()]
        .filter((k) => k !== UNCATEGORIZED_ID)
        .map((k) => rootCategoryId(k)),
    ),
  ];
  rootIds.sort((a, b) => {
    const ta = Math.abs(rollupBuckets.get(a)?.total ?? 0);
    const tb = Math.abs(rollupBuckets.get(b)?.total ?? 0);
    if (tb !== ta) return tb - ta;
    return (meta.get(a)?.name ?? "").localeCompare(
      meta.get(b)?.name ?? "",
      undefined,
      { sensitivity: "base" },
    );
  });

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
          rootCategoryId(k) === root &&
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
        if (ba) children.push(buildDetailRow(ck, ba));
      }
    }

    applyShareOfAbs([parentRow, ...children]);
    tableGroups.push({ parent: parentRow, children });
  }

  if (buckets.has(UNCATEGORIZED_ID)) {
    const u = buckets.get(UNCATEGORIZED_ID)!;
    const parentRow: CategoryReportRow = {
      categoryId: null,
      parentCategoryId: null,
      parentName: null,
      name: "Uncategorized",
      segmentLabel: "Uncategorized",
      total: Math.round(u.total * 100) / 100,
      count: u.count,
      shareOfAbs: 0,
      color: hueForKey(UNCATEGORIZED_ID),
    };
    applyShareOfAbs([parentRow]);
    tableGroups.push({ parent: parentRow, children: [] });
  }

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
