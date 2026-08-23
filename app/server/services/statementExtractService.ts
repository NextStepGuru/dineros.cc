import papaparse from "papaparse";
import { z } from "zod";
import { roundToCents } from "~/lib/bankers-rounding";
import env from "~/server/env";
import { getOpenAIClient } from "~/server/clients/openaiClient";
import { loggedChatCompletion } from "~/server/services/OpenAiCompletionLogger";
import { dateTimeService } from "~/server/services/forecast";
import {
  amountsMatch,
  reconciliationClearedBalance,
} from "~/server/lib/reconciliationMath";

export type ExtractedStatementLine = {
  date: string;
  description: string;
  amount: number;
  lineType: string | null;
};

export type ExtractedStatement = {
  startDate: string | null;
  endDate: string | null;
  openingBalance: number | null;
  endingBalance: number | null;
  incomeTotal: number | null;
  expenseTotal: number | null;
  lines: ExtractedStatementLine[];
  controlOk: boolean;
  controlExpectedEnding: number | null;
  source: "pdf" | "csv" | "ofx" | "llm";
  warnings: string[];
};

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const MONTH_RE = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
const MONEY_RE = /-?\$?\s*[\d,]+\.\d{2}/g;
const DATE_LINE_RE = new RegExp(
  `^(${MONTH_RE})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?\\b(.*)$`,
  "i",
);
const PERIOD_RE = new RegExp(
  `(${MONTH_RE})\\s+(\\d{1,2}),\\s+(\\d{4})\\s+thru\\s+(${MONTH_RE})\\s+(\\d{1,2}),\\s+(\\d{4})`,
  "i",
);
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const OFX_DATE_RE = /^(\d{4})(\d{2})(\d{2})/;
const TYPE_TOKENS = [
  "EFT Credit",
  "External",
  "Withdrawal",
  "Deposit",
  "TRANSFER",
  "Credit",
  "Debit",
  "POS",
];

const llmExtractSchema = z.object({
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  openingBalance: z.number().nullable().optional(),
  endingBalance: z.number().nullable().optional(),
  incomeTotal: z.number().nullable().optional(),
  expenseTotal: z.number().nullable().optional(),
  lines: z
    .array(
      z.object({
        date: z.string(),
        description: z.string(),
        amount: z.number(),
        lineType: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

function parseMoney(raw: string): number | null {
  const cleaned = raw
    .replaceAll(",", "")
    .replaceAll("$", "")
    .replaceAll(/\s/g, "")
    .replaceAll("−", "-")
    .replaceAll("–", "-");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return roundToCents(n);
}

function collectMoney(text: string): number[] {
  const matches = text.match(MONEY_RE) ?? [];
  return matches
    .map((m) => parseMoney(m))
    .filter((n): n is number => n != null);
}

function isoDate(year: number, monthIndex0: number, day: number): string {
  return dateTimeService.format(
    "YYYY-MM-DD",
    dateTimeService.utcCalendarDate(year, monthIndex0, day),
  );
}

function parseFlexibleDate(
  raw: string,
  fallbackYear: number | null,
): string | null {
  const trimmed = raw.trim();
  const iso = ISO_DATE_RE.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ofx = OFX_DATE_RE.exec(trimmed.replaceAll(/\D/g, "").slice(0, 8));
  if (ofx && trimmed.replaceAll(/\D/g, "").length >= 8) {
    return `${ofx[1]}-${ofx[2]}-${ofx[3]}`;
  }
  const mdy = new RegExp(
    `^(${MONTH_RE})\\s+(\\d{1,2}),?\\s+(\\d{4})$`,
    "i",
  ).exec(trimmed);
  if (mdy) {
    const month = MONTHS[mdy[1]!.slice(0, 3).toLowerCase()];
    if (month == null) return null;
    return isoDate(Number(mdy[3]), month, Number(mdy[2]));
  }
  const md = new RegExp(`^(${MONTH_RE})\\s+(\\d{1,2})$`, "i").exec(trimmed);
  if (md && fallbackYear != null) {
    const month = MONTHS[md[1]!.slice(0, 3).toLowerCase()];
    if (month == null) return null;
    return isoDate(fallbackYear, month, Number(md[2]));
  }
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    return isoDate(year, Number(slash[1]) - 1, Number(slash[2]));
  }
  return null;
}

function splitType(description: string): {
  description: string;
  lineType: string | null;
} {
  let rest = description.trim();
  let lineType: string | null = null;
  for (const token of TYPE_TOKENS) {
    const re = new RegExp(`\\b${token}\\b`, "ig");
    if (re.test(rest)) {
      lineType = lineType ? `${lineType} ${token}` : token;
      rest = rest.replaceAll(re, " ");
    }
  }
  return {
    description: rest.replaceAll(/\s+/g, " ").trim(),
    lineType,
  };
}

function isNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^page\s+\d+\s+of\s+\d+/i.test(t)) return true;
  if (/^--\s*\d+\s+of\s+\d+/i.test(t)) return true;
  if (/^date\s+description/i.test(t)) return true;
  if (/novo platform/i.test(t)) return true;
  if (/deposit account services/i.test(t)) return true;
  if (/^customer info$/i.test(t)) return true;
  if (/^account number$/i.test(t)) return true;
  if (/^statement date$/i.test(t)) return true;
  if (/^starting balance/i.test(t)) return true;
  if (/member fdic/i.test(t)) return true;
  return false;
}

function yearForMonth(
  monthIndex0: number,
  start: { year: number; month: number } | null,
  end: { year: number; month: number } | null,
): number {
  if (start && end && start.year !== end.year) {
    return monthIndex0 >= start.month ? start.year : end.year;
  }
  return (
    start?.year ??
    end?.year ??
    Number(dateTimeService.format("YYYY", dateTimeService.now()))
  );
}

function parsePeriodFromText(text: string): {
  startDate: string | null;
  endDate: string | null;
  start: { year: number; month: number } | null;
  end: { year: number; month: number } | null;
} {
  const match = PERIOD_RE.exec(text);
  if (!match) {
    return { startDate: null, endDate: null, start: null, end: null };
  }
  const startMonth = MONTHS[match[1]!.slice(0, 3).toLowerCase()];
  const endMonth = MONTHS[match[4]!.slice(0, 3).toLowerCase()];
  if (startMonth == null || endMonth == null) {
    return { startDate: null, endDate: null, start: null, end: null };
  }
  const startYear = Number(match[3]);
  const endYear = Number(match[6]);
  return {
    startDate: isoDate(startYear, startMonth, Number(match[2])),
    endDate: isoDate(endYear, endMonth, Number(match[5])),
    start: { year: startYear, month: startMonth },
    end: { year: endYear, month: endMonth },
  };
}

function parseHeaderBalances(text: string): {
  openingBalance: number | null;
  endingBalance: number | null;
  incomeTotal: number | null;
  expenseTotal: number | null;
} {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const headerIdx = lines.findIndex((line) => /starting balance/i.test(line));
  const candidates: string[] = [];
  if (headerIdx >= 0) {
    candidates.push(
      `${lines[headerIdx]} ${lines[headerIdx + 1] ?? ""} ${lines[headerIdx + 2] ?? ""}`,
    );
  }
  for (const line of lines) {
    if (collectMoney(line).length >= 4 && /\$/.test(line)) {
      candidates.push(line);
    }
  }
  for (const candidate of candidates) {
    const amounts = collectMoney(candidate);
    if (amounts.length >= 4) {
      return {
        openingBalance: amounts[0]!,
        incomeTotal: amounts[1]!,
        expenseTotal: amounts[2]!,
        endingBalance: amounts[3]!,
      };
    }
  }
  return {
    openingBalance: null,
    endingBalance: null,
    incomeTotal: null,
    expenseTotal: null,
  };
}

function parseTransactionLines(
  text: string,
  start: { year: number; month: number } | null,
  end: { year: number; month: number } | null,
): ExtractedStatementLine[] {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const out: ExtractedStatementLine[] = [];
  let current: {
    date: string;
    parts: string[];
  } | null = null;

  const flush = () => {
    if (!current) return;
    const joined = current.parts.join(" ").replaceAll(/\s+/g, " ").trim();
    const money = collectMoney(joined);
    const amount = money.length > 0 ? money[money.length - 1]! : null;
    if (amount == null) {
      current = null;
      return;
    }
    let desc = joined;
    const lastMoney = joined.match(MONEY_RE)?.at(-1);
    if (lastMoney) {
      desc = joined.slice(0, joined.lastIndexOf(lastMoney)).trim();
    }
    const split = splitType(desc);
    if (split.description) {
      out.push({
        date: current.date,
        description: split.description.slice(0, 1500),
        amount,
        lineType: split.lineType,
      });
    }
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (isNoiseLine(line)) continue;
    const dateMatch = DATE_LINE_RE.exec(line);
    if (dateMatch) {
      flush();
      const month = MONTHS[dateMatch[1]!.slice(0, 3).toLowerCase()];
      if (month == null) continue;
      const year =
        dateMatch[3] != null
          ? Number(dateMatch[3])
          : yearForMonth(month, start, end);
      current = {
        date: isoDate(year, month, Number(dateMatch[2])),
        parts: [dateMatch[4] ?? ""],
      };
      continue;
    }
    if (current) {
      current.parts.push(line);
    }
  }
  flush();
  return out;
}

function withControl(result: ExtractedStatement): ExtractedStatement {
  const warnings = [...result.warnings];
  let controlExpectedEnding: number | null = null;
  let controlOk = false;

  if (result.openingBalance != null && result.endingBalance != null) {
    if (result.lines.length > 0) {
      const net = result.lines.reduce((sum, line) => sum + line.amount, 0);
      controlExpectedEnding = reconciliationClearedBalance(
        result.openingBalance,
        net,
      );
      controlOk = amountsMatch(controlExpectedEnding, result.endingBalance);
      if (!controlOk) {
        warnings.push(
          "Extracted lines do not roll opening balance to the statement ending balance.",
        );
      }
    } else if (
      result.incomeTotal != null &&
      result.expenseTotal != null
    ) {
      controlExpectedEnding = reconciliationClearedBalance(
        result.openingBalance,
        result.incomeTotal + result.expenseTotal,
      );
      controlOk = amountsMatch(controlExpectedEnding, result.endingBalance);
      if (!controlOk) {
        warnings.push("Header income and expenses do not equal the ending balance.");
      }
    }
  } else {
    warnings.push("Could not read opening and ending balances.");
  }

  if (result.lines.length === 0) {
    warnings.push("No statement lines were extracted.");
  }

  return {
    ...result,
    controlOk,
    controlExpectedEnding,
    warnings,
  };
}

function parseBankText(text: string, source: ExtractedStatement["source"]): ExtractedStatement {
  const period = parsePeriodFromText(text);
  const balances = parseHeaderBalances(text);
  const lines = parseTransactionLines(text, period.start, period.end);
  return withControl({
    startDate: period.startDate,
    endDate: period.endDate,
    openingBalance: balances.openingBalance,
    endingBalance: balances.endingBalance,
    incomeTotal: balances.incomeTotal,
    expenseTotal: balances.expenseTotal,
    lines,
    controlOk: false,
    controlExpectedEnding: null,
    source,
    warnings: [],
  });
}

function parseCsv(text: string): ExtractedStatement {
  const parsed = papaparse.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const rows = parsed.data.filter((row) =>
    Object.values(row).some((v) => String(v ?? "").trim()),
  );
  const lines: ExtractedStatementLine[] = [];
  for (const row of rows) {
    const keys = Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), String(v ?? "").trim()]),
    );
    const dateRaw =
      keys.date ||
      keys["posted date"] ||
      keys["transaction date"] ||
      keys.postedat ||
      "";
    const date = parseFlexibleDate(dateRaw, null);
    const desc =
      keys.description || keys.memo || keys.name || keys.payee || "";
    const credit = keys.credit ? parseMoney(keys.credit) : null;
    const debit = keys.debit ? parseMoney(keys.debit) : null;
    let amount = keys.amount ? parseMoney(keys.amount) : null;
    if (amount == null && (credit != null || debit != null)) {
      amount = roundToCents((credit ?? 0) - Math.abs(debit ?? 0));
    }
    if (!date || !desc || amount == null) continue;
    const split = splitType(desc);
    lines.push({
      date,
      description: split.description.slice(0, 1500),
      amount,
      lineType: keys.type || split.lineType,
    });
  }

  const dates = lines.map((l) => l.date).sort();
  const credits = roundToCents(
    lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0),
  );
  const debits = roundToCents(
    lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0),
  );

  return withControl({
    startDate: dates[0] ?? null,
    endDate: dates.at(-1) ?? null,
    openingBalance: null,
    endingBalance: null,
    incomeTotal: credits || null,
    expenseTotal: debits || null,
    lines,
    controlOk: false,
    controlExpectedEnding: null,
    source: "csv",
    warnings: [],
  });
}

function ofxTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<\\n]+)`, "i");
  const match = re.exec(block);
  return match ? match[1]!.trim() : null;
}

function parseOfx(text: string): ExtractedStatement {
  const startRaw = ofxTag(text, "DTSTART");
  const endRaw = ofxTag(text, "DTEND");
  const balRaw = ofxTag(text, "BALAMT");
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const lines: ExtractedStatementLine[] = [];
  for (const block of blocks) {
    const date = parseFlexibleDate(ofxTag(block, "DTPOSTED") ?? "", null);
    const amount = parseMoney(ofxTag(block, "TRNAMT") ?? "");
    const name = ofxTag(block, "NAME") ?? ofxTag(block, "MEMO") ?? "";
    const type = ofxTag(block, "TRNTYPE");
    if (!date || amount == null || !name) continue;
    lines.push({
      date,
      description: name.slice(0, 1500),
      amount,
      lineType: type,
    });
  }
  return withControl({
    startDate: startRaw ? parseFlexibleDate(startRaw, null) : (lines[0]?.date ?? null),
    endDate: endRaw
      ? parseFlexibleDate(endRaw, null)
      : (lines.at(-1)?.date ?? null),
    openingBalance: null,
    endingBalance: balRaw ? parseMoney(balRaw) : null,
    incomeTotal: null,
    expenseTotal: null,
    lines,
    controlOk: false,
    controlExpectedEnding: null,
    source: "ofx",
    warnings: [],
  });
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const extracted = await extractText(pdf, { mergePages: true });
  return extracted.text;
}

function extractModel(): string {
  return (
    env?.OPENAI_PLAID_MATCH_MODEL?.trim() ||
    env?.OPENAI_PLAID_TX_MODEL?.trim() ||
    "gpt-5-mini"
  );
}

async function llmExtractFromText(
  text: string,
  userId: number,
): Promise<ExtractedStatement | null> {
  const client = getOpenAIClient();
  if (!client || !env?.OPENAI_API_KEY?.trim()) return null;
  const clipped = text.slice(0, 18000);
  try {
    const completion = await loggedChatCompletion({
      client,
      purpose: "statement_extract",
      metadata: {
        userId,
        charCount: clipped.length,
      },
      body: {
        model: extractModel(),
        messages: [
          {
            role: "system",
            content:
              'Extract a bank statement into JSON only. Shape: {"startDate":"YYYY-MM-DD"|null,"endDate":"YYYY-MM-DD"|null,"openingBalance":number|null,"endingBalance":number|null,"incomeTotal":number|null,"expenseTotal":number|null,"lines":[{"date":"YYYY-MM-DD","description":string,"amount":number,"lineType":string|null}]}. Amounts are signed (withdrawals negative, deposits positive). Prefer leaf merchant names in description. Ignore page headers/footers.',
          },
          { role: "user", content: clipped },
        ],
        response_format: { type: "json_object" },
      },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = llmExtractSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const lines: ExtractedStatementLine[] = [];
    for (const line of parsed.data.lines ?? []) {
      const date = parseFlexibleDate(line.date, null);
      if (!date || !line.description.trim()) continue;
      lines.push({
        date,
        description: line.description.trim().slice(0, 1500),
        amount: roundToCents(line.amount),
        lineType: line.lineType ?? null,
      });
    }
    return withControl({
      startDate: parsed.data.startDate
        ? parseFlexibleDate(parsed.data.startDate, null)
        : null,
      endDate: parsed.data.endDate
        ? parseFlexibleDate(parsed.data.endDate, null)
        : null,
      openingBalance:
        parsed.data.openingBalance != null
          ? roundToCents(parsed.data.openingBalance)
          : null,
      endingBalance:
        parsed.data.endingBalance != null
          ? roundToCents(parsed.data.endingBalance)
          : null,
      incomeTotal:
        parsed.data.incomeTotal != null
          ? roundToCents(parsed.data.incomeTotal)
          : null,
      expenseTotal:
        parsed.data.expenseTotal != null
          ? roundToCents(parsed.data.expenseTotal)
          : null,
      lines,
      controlOk: false,
      controlExpectedEnding: null,
      source: "llm",
      warnings: [],
    });
  } catch {
    return null;
  }
}

function looksIncomplete(result: ExtractedStatement): boolean {
  return (
    result.lines.length < 3 ||
    result.startDate == null ||
    result.endDate == null ||
    result.openingBalance == null ||
    result.endingBalance == null
  );
}

export async function extractStatementFromUpload(params: {
  filename: string;
  buffer: Buffer;
  userId: number;
}): Promise<ExtractedStatement> {
  const name = params.filename.toLowerCase();
  const asText = params.buffer.toString("utf8");

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return parseCsv(asText);
  }
  if (
    name.endsWith(".ofx") ||
    name.endsWith(".qfx") ||
    /<OFX>/i.test(asText) ||
    /OFXHEADER/i.test(asText)
  ) {
    return parseOfx(asText);
  }

  let text: string;
  try {
    text = await extractPdfText(params.buffer);
  } catch {
    text = "";
  }

  if (!text.trim()) {
    const empty = withControl({
      startDate: null,
      endDate: null,
      openingBalance: null,
      endingBalance: null,
      incomeTotal: null,
      expenseTotal: null,
      lines: [],
      controlOk: false,
      controlExpectedEnding: null,
      source: "pdf",
      warnings: [
        "No text layer found in this PDF. Upload a CSV/OFX export instead.",
      ],
    });
    return empty;
  }

  let parsed = parseBankText(text, "pdf");
  if (looksIncomplete(parsed) || !parsed.controlOk) {
    const llm = await llmExtractFromText(text, params.userId);
    if (llm && (llm.lines.length > parsed.lines.length || llm.controlOk)) {
      parsed = llm;
    } else if (!parsed.controlOk && llm?.warnings.length) {
      parsed = {
        ...parsed,
        warnings: [...parsed.warnings, ...llm.warnings],
      };
    }
  }
  return parsed;
}
