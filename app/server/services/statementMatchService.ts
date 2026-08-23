import { z } from "zod";
import env from "~/server/env";
import { prisma as defaultPrisma } from "~/server/clients/prismaClient";
import { getOpenAIClient } from "~/server/clients/openaiClient";
import { loggedChatCompletion } from "~/server/services/OpenAiCompletionLogger";
import { dateTimeService } from "~/server/services/forecast";
import {
  merchantNameFromPlaid,
  normalizeMerchantKey,
} from "~/server/lib/merchantCategoryKey";
import { toAmountCents } from "~/server/lib/reconciliationMath";

export type StatementMatchStatus =
  | "unmatched"
  | "matched"
  | "statement_only"
  | "conflict"
  | "ignored";

export type StatementLineRow = {
  id: number;
  postedAt: Date;
  description: string;
  amount: number;
  lineType: string | null;
  matchStatus: StatementMatchStatus;
  registerEntryId: string | null;
  ignoredAt: Date | null;
};

export type ItemRow = {
  id: number;
  registerEntryId: string;
  isCleared: boolean;
  registerEntry: {
    id: string;
    createdAt: Date;
    description: string;
    amount: number;
    isReconciled: boolean;
    isProjected: boolean;
    isPending: boolean;
    reoccurrenceId: number | null;
    sourceAccountRegisterId: number | null;
    plaidJson: unknown;
  };
};

const NOISE_TOKENS = new Set([
  "pos",
  "withdrawal",
  "debit",
  "credit",
  "eft",
  "external",
  "deposit",
  "payment",
  "the",
  "and",
  "inc",
  "llc",
  "ltd",
  "com",
  "www",
  "http",
  "https",
]);

const TRANSFER_RE =
  /\b(transfer|webxfr|xfr|wire|step account|online trnsfr)\b/i;

const aiMatchSchema = z.object({
  matches: z.array(
    z.object({
      statementLineId: z.number().int(),
      entryId: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
      conflict: z.boolean().optional(),
    }),
  ),
});

type PrismaMatchBridge = {
  statementLine: {
    findMany(_args: unknown): Promise<StatementLineRow[]>;
    update(_args: unknown): Promise<unknown>;
  };
  reconciliationItem: {
    findMany(_args: unknown): Promise<ItemRow[]>;
    update(_args: unknown): Promise<unknown>;
  };
  registerEntry: {
    findFirst(
      _args: unknown,
    ): Promise<{
      id: string;
      reoccurrenceId: number | null;
      transferAccountRegisterId?: number | null;
    } | null>;
    update(_args: unknown): Promise<unknown>;
  };
  reoccurrence: {
    findMany(
      _args: unknown,
    ): Promise<Array<{ id: number; transferAccountRegisterId: number | null }>>;
  };
};

const db = defaultPrisma as unknown as PrismaMatchBridge;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function dateKey(date: Date): string {
  return dateTimeService.format("YYYY-MM-DD", date);
}

function dayDiff(a: Date, b: Date): number {
  return Math.abs(dateTimeService.diff(a, b, "day"));
}

function merchantTokens(raw: string): string[] {
  return normalizeMerchantKey(raw)
    .split(" ")
    .map((t) => t.replaceAll(/[^a-z0-9]/g, ""))
    .filter((t) => t.length > 2 && !NOISE_TOKENS.has(t) && !/^\d+$/.test(t));
}

function merchantsOverlap(left: string, right: string): boolean {
  const a = merchantTokens(left);
  const b = merchantTokens(right);
  if (a.length === 0 || b.length === 0) return false;
  const setB = new Set(b);
  if (a.some((t) => setB.has(t))) return true;
  const joinedA = a.join(" ");
  const joinedB = b.join(" ");
  return joinedA.includes(joinedB) || joinedB.includes(joinedA);
}

function entryMerchantText(entry: ItemRow["registerEntry"]): string {
  const record = asRecord(entry.plaidJson);
  const fromPlaid = merchantNameFromPlaid(record);
  return `${fromPlaid} ${entry.description}`.trim();
}

function isPlaidPending(entry: ItemRow["registerEntry"]): boolean {
  const record = asRecord(entry.plaidJson);
  return record?.pending === true;
}

function postedAfterPeriod(
  entry: ItemRow["registerEntry"],
  endDate: Date,
): boolean {
  const record = asRecord(entry.plaidJson);
  const posted =
    (typeof record?.date === "string" && record.date) ||
    (typeof record?.datetime === "string" && record.datetime) ||
    null;
  if (!posted) return false;
  try {
    const postedKey = dateKey(
      dateTimeService.parseInput(posted.length >= 10 ? posted.slice(0, 10) : posted).toDate(),
    );
    return postedKey > dateKey(endDate);
  } catch {
    return false;
  }
}

function minConfidence(): number {
  const raw = env?.OPENAI_PLAID_MATCH_MIN_CONFIDENCE;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0.7;
}

function matchModel(): string {
  return (
    env?.OPENAI_PLAID_MATCH_MODEL?.trim() ||
    env?.OPENAI_PLAID_TX_MODEL?.trim() ||
    "gpt-5-mini"
  );
}

async function setLineMatch(params: {
  lineId: number;
  entryId: string;
  status: StatementMatchStatus;
  confidence: number;
  reason: string;
}): Promise<void> {
  await db.statementLine.update({
    where: { id: params.lineId },
    data: {
      registerEntryId: params.entryId,
      matchStatus: params.status,
      matchConfidence: params.confidence,
      matchReason: params.reason.slice(0, 500),
      ignoredAt: null,
    },
  });
}

async function markStatementOnly(lineId: number): Promise<void> {
  await db.statementLine.update({
    where: { id: lineId },
    data: {
      registerEntryId: null,
      matchStatus: "statement_only",
      matchConfidence: null,
      matchReason: "No ledger match",
    },
  });
}

async function clearItemForEntry(
  items: ItemRow[],
  entryId: string,
): Promise<void> {
  const item = items.find((i) => i.registerEntryId === entryId);
  if (!item || item.isCleared || item.registerEntry.isReconciled) return;
  await db.reconciliationItem.update({
    where: { id: item.id },
    data: {
      isCleared: true,
      clearedAt: dateTimeService.toDate(),
    },
  });
  await db.registerEntry.update({
    where: { id: entryId },
    data: {
      isCleared: true,
      isPending: true,
    },
  });
}

function pairExactSameDay(
  lines: StatementLineRow[],
  items: ItemRow[],
  usedLineIds: Set<number>,
  usedEntryIds: Set<string>,
): Array<{ line: StatementLineRow; item: ItemRow }> {
  const groups = new Map<string, { lines: StatementLineRow[]; items: ItemRow[] }>();
  const take = (key: string) => {
    let g = groups.get(key);
    if (!g) {
      g = { lines: [], items: [] };
      groups.set(key, g);
    }
    return g;
  };
  for (const line of lines) {
    if (usedLineIds.has(line.id)) continue;
    take(`${toAmountCents(Number(line.amount))}|${dateKey(line.postedAt)}`).lines.push(
      line,
    );
  }
  for (const item of items) {
    if (usedEntryIds.has(item.registerEntryId)) continue;
    if (item.registerEntry.isReconciled) continue;
    take(
      `${toAmountCents(Number(item.registerEntry.amount))}|${dateKey(item.registerEntry.createdAt)}`,
    ).items.push(item);
  }
  const pairs: Array<{ line: StatementLineRow; item: ItemRow }> = [];
  for (const g of groups.values()) {
    const n = Math.min(g.lines.length, g.items.length);
    for (let i = 0; i < n; i += 1) {
      pairs.push({ line: g.lines[i]!, item: g.items[i]! });
    }
  }
  return pairs;
}

async function llmMatchLeftovers(params: {
  lines: StatementLineRow[];
  items: ItemRow[];
  usedEntryIds: Set<string>;
  userId: number;
  accountId: string;
  periodId: number;
}): Promise<
  Array<{
    lineId: number;
    entryId: string | null;
    confidence: number;
    reason: string;
    conflict: boolean;
  }>
> {
  const leftoverLines = params.lines.filter(
    (l) =>
      l.matchStatus !== "ignored" &&
      l.matchStatus !== "matched" &&
      !l.ignoredAt,
  );
  const leftoverItems = params.items.filter(
    (i) =>
      !params.usedEntryIds.has(i.registerEntryId) &&
      !i.registerEntry.isReconciled,
  );
  if (leftoverLines.length === 0 || leftoverItems.length === 0) return [];

  const client = getOpenAIClient();
  if (!client || !env?.OPENAI_API_KEY?.trim()) return [];

  const out: Array<{
    lineId: number;
    entryId: string | null;
    confidence: number;
    reason: string;
    conflict: boolean;
  }> = [];
  const minConf = minConfidence();

  for (let i = 0; i < leftoverLines.length; i += 25) {
    const lineBatch = leftoverLines.slice(i, i + 25);
    const userMsg = [
      "Unmatched bank statement lines:",
      ...lineBatch.map((l) =>
        JSON.stringify({
          statementLineId: l.id,
          date: dateKey(l.postedAt),
          amount: Number(l.amount),
          description: l.description,
          lineType: l.lineType,
        }),
      ),
      "",
      "Unmatched ledger entries:",
      ...leftoverItems.map((item) =>
        JSON.stringify({
          entryId: item.registerEntryId,
          date: dateKey(item.registerEntry.createdAt),
          amount: Number(item.registerEntry.amount),
          description: item.registerEntry.description,
          isProjected: item.registerEntry.isProjected,
          isPending: item.registerEntry.isPending || isPlaidPending(item.registerEntry),
        }),
      ),
      "",
      `Minimum confidence: ${minConf}. Prefer same signed amount. Statement date is posted date; ledger date may differ by a few days. Transfers and refunds may use different names.`,
    ].join("\n");

    try {
      const completion = await loggedChatCompletion({
        client,
        purpose: "statement_line_match",
        metadata: {
          userId: params.userId,
          accountId: params.accountId,
          periodId: params.periodId,
          lineCount: lineBatch.length,
        },
        body: {
          model: matchModel(),
          messages: [
            {
              role: "system",
              content:
                'Match bank statement lines to ledger entries. JSON only: {"matches":[{"statementLineId":number,"entryId":string|null,"confidence":0-1,"reason":string,"conflict":boolean}]}. Each statementLineId once. Never reuse an entryId. Set conflict true when the merchant is the same but the amount is wrong. Leave entryId null when unsure.',
            },
            { role: "user", content: userMsg },
          ],
          response_format: { type: "json_object" },
        },
      });
      const raw = completion.choices[0]?.message?.content;
      if (!raw) continue;
      const parsed = aiMatchSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) continue;
      const usedInBatch = new Set<string>();
      const allowedLineIds = new Set(lineBatch.map((l) => l.id));
      const allowedEntryIds = new Set(
        leftoverItems.map((item) => item.registerEntryId),
      );
      for (const row of parsed.data.matches) {
        if (!allowedLineIds.has(row.statementLineId)) continue;
        let entryId = row.entryId;
        if (entryId && (usedInBatch.has(entryId) || !allowedEntryIds.has(entryId))) {
          entryId = null;
        }
        if (entryId) usedInBatch.add(entryId);
        out.push({
          lineId: row.statementLineId,
          entryId,
          confidence: row.confidence,
          reason: row.reason.slice(0, 500),
          conflict: Boolean(row.conflict),
        });
      }
    } catch {
      continue;
    }
  }
  return out;
}

export async function matchStatementLinesForPeriod(params: {
  periodId: number;
  userId: number;
  accountId: string;
}): Promise<{ matched: number; conflicts: number; statementOnly: number }> {
  const lines = await db.statementLine.findMany({
    where: { reconciliationPeriodId: params.periodId },
    orderBy: [{ sortIndex: "asc" }, { id: "asc" }],
  });
  const items = await db.reconciliationItem.findMany({
    where: { reconciliationPeriodId: params.periodId },
    include: {
      registerEntry: {
        select: {
          id: true,
          createdAt: true,
          description: true,
          amount: true,
          isReconciled: true,
          isProjected: true,
          isPending: true,
          reoccurrenceId: true,
          sourceAccountRegisterId: true,
          plaidJson: true,
        },
      },
    },
  });

  const usedLineIds = new Set<number>();
  const usedEntryIds = new Set<string>();
  let matched = 0;
  let conflicts = 0;

  for (const line of lines) {
    if (line.matchStatus === "ignored" || line.ignoredAt) {
      usedLineIds.add(line.id);
    }
    if (line.matchStatus === "matched" && line.registerEntryId) {
      usedLineIds.add(line.id);
      usedEntryIds.add(line.registerEntryId);
      matched += 1;
    }
  }

  const exactPairs = pairExactSameDay(lines, items, usedLineIds, usedEntryIds);
  for (const { line, item } of exactPairs) {
    usedLineIds.add(line.id);
    usedEntryIds.add(item.registerEntryId);
    await setLineMatch({
      lineId: line.id,
      entryId: item.registerEntryId,
      status: "matched",
      confidence: 1,
      reason: "Exact amount and posted date",
    });
    await clearItemForEntry(items, item.registerEntryId);
    matched += 1;
  }

  for (const line of lines) {
    if (usedLineIds.has(line.id)) continue;
    const cents = toAmountCents(Number(line.amount));
    const candidates = items.filter((item) => {
      if (usedEntryIds.has(item.registerEntryId)) return false;
      if (item.registerEntry.isReconciled) return false;
      if (toAmountCents(Number(item.registerEntry.amount)) !== cents) return false;
      return dayDiff(line.postedAt, item.registerEntry.createdAt) <= 3;
    });
    if (candidates.length === 0) continue;
    const withMerchant = candidates.filter((item) =>
      merchantsOverlap(line.description, entryMerchantText(item.registerEntry)),
    );
    const pick =
      withMerchant.length === 1
        ? withMerchant[0]
        : candidates.length === 1
          ? candidates[0]
          : withMerchant
              .slice()
              .sort(
                (a, b) =>
                  dayDiff(line.postedAt, a.registerEntry.createdAt) -
                  dayDiff(line.postedAt, b.registerEntry.createdAt),
              )[0];
    if (!pick) continue;
    usedLineIds.add(line.id);
    usedEntryIds.add(pick.registerEntryId);
    await setLineMatch({
      lineId: line.id,
      entryId: pick.registerEntryId,
      status: "matched",
      confidence: withMerchant.length ? 0.9 : 0.85,
      reason: "Same amount within 3 days",
    });
    await clearItemForEntry(items, pick.registerEntryId);
    matched += 1;
  }

  for (const line of lines) {
    if (usedLineIds.has(line.id)) continue;
    const near = items.filter((item) => {
      if (usedEntryIds.has(item.registerEntryId)) return false;
      if (item.registerEntry.isReconciled) return false;
      if (dayDiff(line.postedAt, item.registerEntry.createdAt) > 3) return false;
      return merchantsOverlap(line.description, entryMerchantText(item.registerEntry));
    });
    if (near.length !== 1) continue;
    const item = near[0]!;
    const amountOff =
      toAmountCents(Number(line.amount)) !==
      toAmountCents(Number(item.registerEntry.amount));
    if (!amountOff) continue;
    usedLineIds.add(line.id);
    usedEntryIds.add(item.registerEntryId);
    await setLineMatch({
      lineId: line.id,
      entryId: item.registerEntryId,
      status: "conflict",
      confidence: 0.6,
      reason: "Same merchant near the posted date but amount differs",
    });
    conflicts += 1;
  }

  const leftoverLines = lines.filter((l) => !usedLineIds.has(l.id));
  const llmRows = await llmMatchLeftovers({
    lines: leftoverLines,
    items,
    usedEntryIds,
    userId: params.userId,
    accountId: params.accountId,
    periodId: params.periodId,
  });
  const minConf = minConfidence();
  for (const row of llmRows) {
    if (usedLineIds.has(row.lineId)) continue;
    if (!row.entryId) continue;
    if (usedEntryIds.has(row.entryId)) continue;
    usedLineIds.add(row.lineId);
    usedEntryIds.add(row.entryId);
    if (row.conflict || row.confidence < minConf) {
      await setLineMatch({
        lineId: row.lineId,
        entryId: row.entryId,
        status: "conflict",
        confidence: row.confidence,
        reason: row.reason,
      });
      conflicts += 1;
      continue;
    }
    await setLineMatch({
      lineId: row.lineId,
      entryId: row.entryId,
      status: "matched",
      confidence: row.confidence,
      reason: row.reason,
    });
    await clearItemForEntry(items, row.entryId);
    matched += 1;
  }

  let statementOnly = 0;
  for (const line of lines) {
    if (usedLineIds.has(line.id)) continue;
    if (line.matchStatus === "ignored" || line.ignoredAt) continue;
    await markStatementOnly(line.id);
    statementOnly += 1;
  }

  return { matched, conflicts, statementOnly };
}

export async function loadTransferRecurrenceIds(
  reoccurrenceIds: number[],
): Promise<Set<number>> {
  if (reoccurrenceIds.length === 0) return new Set();
  const recurrences = await db.reoccurrence.findMany({
    where: { id: { in: reoccurrenceIds } },
    select: { id: true, transferAccountRegisterId: true },
  });
  return new Set(
    recurrences
      .filter((r) => r.transferAccountRegisterId != null)
      .map((r) => r.id),
  );
}

export function ledgerOnlyHint(params: {
  item: ItemRow;
  endDate: Date;
  transferRecurrenceIds: Set<number>;
}): "next_statement" | "projected" | "transfer" | "pending" | "missing_from_statement" {
  const { item, endDate, transferRecurrenceIds } = params;
  if (item.registerEntry.isProjected) return "projected";
  if (
    item.registerEntry.reoccurrenceId != null &&
    transferRecurrenceIds.has(item.registerEntry.reoccurrenceId)
  ) {
    return "transfer";
  }
  if (item.registerEntry.sourceAccountRegisterId != null) return "transfer";
  if (TRANSFER_RE.test(item.registerEntry.description)) return "transfer";
  if (isPlaidPending(item.registerEntry) || postedAfterPeriod(item.registerEntry, endDate)) {
    return "next_statement";
  }
  if (item.registerEntry.isPending && !item.isCleared) return "pending";
  return "missing_from_statement";
}
