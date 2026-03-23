import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { budgetWhereForAccountMember } from "~/server/lib/accountAccess";
import { dateTimeService } from "~/server/services/forecast";

export type ReoccurrenceHealthIssueType =
  | "duplicate_rule"
  | "ended_rule"
  | "last_run_after_end"
  | "stale_last_run"
  | "zero_amount";

export type ReoccurrenceHealthIssue = {
  type: ReoccurrenceHealthIssueType;
  reoccurrenceId: number;
  description: string;
  accountRegisterId: number;
  accountRegisterName: string;
  details: string;
  occurrenceKey: string;
};

export type ReoccurrenceHealthCounts = {
  duplicate_rule: number;
  ended_rule: number;
  last_run_after_end: number;
  stale_last_run: number;
  zero_amount: number;
};

type ReoccurrenceRow = {
  id: number;
  description: string;
  amount: unknown;
  intervalId: number;
  intervalCount: number;
  endAt: Date | null;
  lastAt: Date | null;
  accountRegisterId: number;
  register: { name: string };
};

const STALE_DAYS = 90;

const emptyCounts = (): ReoccurrenceHealthCounts => ({
  duplicate_rule: 0,
  ended_rule: 0,
  last_run_after_end: 0,
  stale_last_run: 0,
  zero_amount: 0,
});

function issueForRow(
  row: ReoccurrenceRow,
  type: ReoccurrenceHealthIssueType,
  details: string,
  occurrenceKeyPart: string,
): ReoccurrenceHealthIssue {
  return {
    type,
    reoccurrenceId: row.id,
    description: row.description,
    accountRegisterId: row.accountRegisterId,
    accountRegisterName: row.register.name,
    details,
    occurrenceKey: `${type}:${row.id}:${occurrenceKeyPart}`,
  };
}

function duplicateIssues(rows: ReoccurrenceRow[]): ReoccurrenceHealthIssue[] {
  const duplicateGroups = new Map<string, ReoccurrenceRow[]>();
  for (const row of rows) {
    const key = [
      row.accountRegisterId,
      row.intervalId,
      row.intervalCount,
      Number(row.amount),
      row.description.trim().toLowerCase(),
    ].join("|");
    const list = duplicateGroups.get(key) ?? [];
    list.push(row);
    duplicateGroups.set(key, list);
  }

  const issues: ReoccurrenceHealthIssue[] = [];
  for (const [groupKey, group] of duplicateGroups) {
    if (group.length < 2) continue;
    const ids = group
      .map((row) => row.id)
      .sort((a, b) => a - b)
      .join(",");
    for (const row of group) {
      issues.push(
        issueForRow(
          row,
          "duplicate_rule",
          "Looks duplicated by account, amount, interval, and description.",
          `${groupKey}:${ids}`,
        ),
      );
    }
  }
  return issues;
}

function rowIssues(
  row: ReoccurrenceRow,
  now: Date,
  staleCutoff: Date,
): ReoccurrenceHealthIssue[] {
  const issues: ReoccurrenceHealthIssue[] = [];
  const amount = Number(row.amount);
  if (amount === 0) {
    issues.push(
      issueForRow(
        row,
        "zero_amount",
        "Amount is 0; this rule will not change the forecast.",
        `amount:${amount}`,
      ),
    );
  }

  const lastAt = row.lastAt ? dateTimeService.toDate(row.lastAt) : null;
  const endAt = row.endAt ? dateTimeService.toDate(row.endAt) : null;
  const endAtIso = endAt ? endAt.toISOString().slice(0, 10) : "none";
  const lastAtIso = lastAt ? lastAt.toISOString().slice(0, 10) : "none";
  if (endAt && endAt < now) {
    issues.push(
      issueForRow(row, "ended_rule", "End date is in the past.", `end:${endAtIso}`),
    );
  }
  if (lastAt && endAt && lastAt > endAt) {
    issues.push(
      issueForRow(
        row,
        "last_run_after_end",
        "Last run date is after the end date.",
        `last:${lastAtIso}:end:${endAtIso}`,
      ),
    );
  }
  if (lastAt && !endAt && lastAt < staleCutoff) {
    issues.push(
      issueForRow(
        row,
        "stale_last_run",
        `Last run is older than ${STALE_DAYS} days.`,
        `last:${lastAtIso}`,
      ),
    );
  }
  return issues;
}

function countIssues(issues: ReoccurrenceHealthIssue[]): ReoccurrenceHealthCounts {
  const counts = emptyCounts();
  for (const issue of issues) {
    counts[issue.type] += 1;
  }
  return counts;
}

export async function getReoccurrenceHealth(params: {
  userId: number;
  budgetId: number;
}) {
  const budget = await PrismaDb.budget.findFirst({
    where: budgetWhereForAccountMember(params.userId, params.budgetId),
    select: { id: true },
  });
  if (!budget) {
    return {
      issues: [] as ReoccurrenceHealthIssue[],
      counts: emptyCounts(),
    };
  }

  const rows = await PrismaDb.reoccurrence.findMany({
    where: {
      account: {
        userAccounts: { some: { userId: params.userId } },
      },
      register: {
        budgetId: params.budgetId,
        isArchived: false,
      },
    },
    select: {
      id: true,
      description: true,
      amount: true,
      intervalId: true,
      intervalCount: true,
      endAt: true,
      lastAt: true,
      accountRegisterId: true,
      register: {
        select: { name: true },
      },
    },
    orderBy: [{ id: "asc" }],
  });

  const now = dateTimeService.nowDate();
  const staleCutoff = dateTimeService.toDate(
    dateTimeService.subtract(STALE_DAYS, "day", now),
  );
  const issues = [...duplicateIssues(rows)];
  for (const row of rows) {
    issues.push(...rowIssues(row, now, staleCutoff));
  }

  return {
    issues,
    counts: countIssues(issues),
  };
}
