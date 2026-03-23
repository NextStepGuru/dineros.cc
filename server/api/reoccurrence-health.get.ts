import { z } from "zod";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { budgetWhereForAccountMember } from "~/server/lib/accountAccess";
import { dateTimeService } from "~/server/services/forecast";

const querySchema = z.object({
  budgetId: z.coerce.number().int().positive(),
});

type ReoccurrenceHealthIssue = {
  type:
    | "duplicate_rule"
    | "ended_rule"
    | "last_run_after_end"
    | "stale_last_run"
    | "zero_amount";
  reoccurrenceId: number;
  description: string;
  accountRegisterId: number;
  accountRegisterName: string;
  details: string;
};

const STALE_DAYS = 90;

type ReoccurrenceHealthCounts = {
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
  lastAt: Date;
  accountRegisterId: number;
  accountRegister: { name: string };
};

const emptyCounts = (): ReoccurrenceHealthCounts => ({
  duplicate_rule: 0,
  ended_rule: 0,
  last_run_after_end: 0,
  stale_last_run: 0,
  zero_amount: 0,
});

function issueForRow(
  row: ReoccurrenceRow,
  type: ReoccurrenceHealthIssue["type"],
  details: string,
): ReoccurrenceHealthIssue {
  return {
    type,
    reoccurrenceId: row.id,
    description: row.description,
    accountRegisterId: row.accountRegisterId,
    accountRegisterName: row.accountRegister.name,
    details,
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
  for (const [, group] of duplicateGroups) {
    if (group.length < 2) continue;
    for (const row of group) {
      issues.push(
        issueForRow(
          row,
          "duplicate_rule",
          "Looks duplicated by account, amount, interval, and description.",
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
      issueForRow(row, "zero_amount", "Amount is 0; this rule will not change the forecast."),
    );
  }

  const lastAt = row.lastAt ? dateTimeService.toDate(row.lastAt) : null;
  const endAt = row.endAt ? dateTimeService.toDate(row.endAt) : null;
  if (endAt && endAt < now) {
    issues.push(issueForRow(row, "ended_rule", "End date is in the past."));
  }
  if (lastAt && endAt && lastAt > endAt) {
    issues.push(
      issueForRow(row, "last_run_after_end", "Last run date is after the end date."),
    );
  }
  if (lastAt && !endAt && lastAt < staleCutoff) {
    issues.push(
      issueForRow(row, "stale_last_run", `Last run is older than ${STALE_DAYS} days.`),
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

async function getHealth(userId: number, budgetId: number) {
  const budget = await PrismaDb.budget.findFirst({
    where: budgetWhereForAccountMember(userId, budgetId),
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
        userAccounts: { some: { userId } },
      },
      accountRegister: {
        budgetId,
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
      accountRegister: {
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

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const q = querySchema.parse(getQuery(event));
    return await getHealth(user.userId, q.budgetId);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
