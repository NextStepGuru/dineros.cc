import { beforeEach, describe, expect, it, vi } from "vitest";

import * as statementExtractService from "../statementExtractService";

// The service reads uploads only; clients must not reach the network or DB.
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/env", () => ({
  default: { OPENAI_API_KEY: "test-key" },
}));

vi.mock("~/server/clients/openaiClient", () => ({
  getOpenAIClient: vi.fn(),
}));

vi.mock("~/server/services/OpenAiCompletionLogger", () => ({
  loggedChatCompletion: vi.fn(),
}));

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    format: vi.fn((fmt: string, input: unknown) => {
      const d = input instanceof Date ? input : new Date(String(input));
      const iso = d.toISOString();
      if (fmt === "YYYY") return iso.slice(0, 4);
      return iso.slice(0, 10);
    }),
    diff: vi.fn((a: Date, b: Date) =>
      Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000),
    ),
    parseInput: vi.fn((input: string) => ({
      toDate: () => new Date(`${input}T00:00:00.000Z`),
    })),
    toDate: vi.fn(() => new Date("2024-01-01T00:00:00.000Z")),
    now: vi.fn(() => new Date("2024-01-01T00:00:00.000Z")),
    utcCalendarDate: vi.fn((y: number, m: number, d: number) =>
      new Date(Date.UTC(y, m, d)),
    ),
  },
}));

vi.mock("unpdf", () => ({
  extractText: vi.fn(),
  getDocumentProxy: vi.fn(),
}));

let loggedChatCompletion: any;
let getOpenAIClient: any;
let extractText: any;
let getDocumentProxy: any;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ loggedChatCompletion } = await import(
    "~/server/services/OpenAiCompletionLogger"
  ));
  ({ getOpenAIClient } = await import("~/server/clients/openaiClient"));
  ({ extractText, getDocumentProxy } = await import("unpdf"));
  getOpenAIClient.mockReturnValue({});
});

const CSV = [
  "Date,Description,Amount",
  "2024-06-01,EFT Credit ACME PAYROLL,1000.00",
  "2024-06-02,POS Withdrawal GROCERY MART,-45.10",
  "2024-06-03,STARBUCKS STORE #123,-5.25",
].join("\n");

const OFX = [
  "OFXHEADER:100",
  "<OFX>",
  "<DTSTART>20240601000000",
  "<DTEND>20240630000000",
  "<BALAMT>1150.00",
  "<STMTTRN>",
  "<DTPOSTED>20240601120000",
  "<TRNAMT>200.00",
  "<NAME>ACME PAYROLL",
  "<TRNTYPE>CREDIT",
  "<STMTTRN>",
  "<DTPOSTED>20240605090000",
  "<TRNAMT>-5.25",
  "<NAME>STARBUCKS",
].join("\n");

/** Full statement text that the deterministic PDF parser handles with a passing control check. */
const FULL_PDF_TEXT = [
  "Customer Info",
  "Account Number",
  "Statement period Jun 1, 2024 thru Jun 30, 2024",
  "Starting Balance",
  "$1,000.00   $200.00   $50.00   $1,150.00",
  "Jun 1 Deposit ACME Payroll 200.00",
  "Jun 5 STARBUCKS -5.00",
  "Jun 6 Grocery Mart POS -45.00",
].join("\n");

describe("statementExtractService", () => {
  describe("CSV uploads", () => {
    it("parses a CSV with an amount column, splitting type tokens", async () => {
      const result = await statementExtractService.extractStatementFromUpload({
        filename: "statement.csv",
        buffer: Buffer.from(CSV, "utf8"),
        userId: 9,
      });

      expect(result.source).toBe("csv");
      expect(result.startDate).toBe("2024-06-01");
      expect(result.endDate).toBe("2024-06-03");
      expect(result.incomeTotal).toBe(1000);
      expect(result.expenseTotal).toBe(-50.35);
      expect(result.openingBalance).toBeNull();
      expect(result.endingBalance).toBeNull();
      expect(result.controlOk).toBe(false);
      expect(result.controlExpectedEnding).toBeNull();
      expect(result.lines).toEqual([
        {
          date: "2024-06-01",
          description: "ACME PAYROLL",
          amount: 1000,
          lineType: "EFT Credit",
        },
        {
          date: "2024-06-02",
          description: "GROCERY MART",
          amount: -45.1,
          lineType: "Withdrawal POS",
        },
        {
          date: "2024-06-03",
          description: "STARBUCKS STORE #123",
          amount: -5.25,
          lineType: null,
        },
      ]);
      expect(result.warnings).toContain(
        "Could not read opening and ending balances.",
      );
      expect(getOpenAIClient).not.toHaveBeenCalled();
      expect(loggedChatCompletion).not.toHaveBeenCalled();
    });

    it("accepts .txt files through the CSV parser", async () => {
      const result = await statementExtractService.extractStatementFromUpload({
        filename: "statement.txt",
        buffer: Buffer.from(CSV, "utf8"),
        userId: 9,
      });

      expect(result.source).toBe("csv");
      expect(result.lines).toHaveLength(3);
    });

    it("derives signed amounts from credit and debit columns", async () => {
      const csv = [
        "Posted Date,Memo,Credit,Debit",
        '"Jun 1, 2024",ACME PAYROLL,1000.00,',
        '"Jun 2, 2024",COFFEE SHOP,,5.25',
      ].join("\n");

      const result = await statementExtractService.extractStatementFromUpload({
        filename: "export.csv",
        buffer: Buffer.from(csv, "utf8"),
        userId: 9,
      });

      expect(result.lines).toEqual([
        {
          date: "2024-06-01",
          description: "ACME PAYROLL",
          amount: 1000,
          lineType: null,
        },
        {
          date: "2024-06-02",
          description: "COFFEE SHOP",
          amount: -5.25,
          lineType: null,
        },
      ]);
      expect(result.startDate).toBe("2024-06-01");
      expect(result.endDate).toBe("2024-06-02");
    });

    it("prefers the explicit type column over the split type tokens", async () => {
      const csv = [
        "Date,Description,Amount,Type",
        "2024-06-01,EFT Credit ACME PAYROLL,1000.00,Business Credit",
      ].join("\n");

      const result = await statementExtractService.extractStatementFromUpload({
        filename: "export.csv",
        buffer: Buffer.from(csv, "utf8"),
        userId: 9,
      });

      expect(result.lines).toEqual([
        {
          date: "2024-06-01",
          description: "ACME PAYROLL",
          amount: 1000,
          lineType: "Business Credit",
        },
      ]);
    });

    it("skips rows without a usable date, description, or amount", async () => {
      const csv = [
        "Date,Description,Amount",
        "2024-06-01,GOOD ROW,10.00",
        ",NO DATE,5.00",
        "2024-06-02,,5.00",
        "2024-06-03,NO AMOUNT,",
      ].join("\n");

      const result = await statementExtractService.extractStatementFromUpload({
        filename: "export.csv",
        buffer: Buffer.from(csv, "utf8"),
        userId: 9,
      });

      expect(result.lines).toEqual([
        {
          date: "2024-06-01",
          description: "GOOD ROW",
          amount: 10,
          lineType: null,
        },
      ]);
      expect(result.warnings).toContain(
        "Could not read opening and ending balances.",
      );
    });
  });

  describe("OFX uploads", () => {
    it("parses OFX transactions, balances, and period bounds", async () => {
      const result = await statementExtractService.extractStatementFromUpload({
        filename: "statement.ofx",
        buffer: Buffer.from(OFX, "utf8"),
        userId: 9,
      });

      expect(result.source).toBe("ofx");
      expect(result.startDate).toBe("2024-06-01");
      expect(result.endDate).toBe("2024-06-30");
      expect(result.endingBalance).toBe(1150);
      expect(result.openingBalance).toBeNull();
      expect(result.lines).toEqual([
        {
          date: "2024-06-01",
          description: "ACME PAYROLL",
          amount: 200,
          lineType: "CREDIT",
        },
        {
          date: "2024-06-05",
          description: "STARBUCKS",
          amount: -5.25,
          lineType: null,
        },
      ]);
      expect(result.warnings).toContain(
        "Could not read opening and ending balances.",
      );
    });

    it("detects OFX content by markup even without an .ofx extension", async () => {
      const result = await statementExtractService.extractStatementFromUpload({
        filename: "download.dat",
        buffer: Buffer.from(OFX, "utf8"),
        userId: 9,
      });

      expect(result.source).toBe("ofx");
      expect(result.lines).toHaveLength(2);
    });
  });

  describe("PDF uploads", () => {
    it("returns a warning result when the PDF has no text layer", async () => {
      extractText.mockRejectedValue(new Error("no text layer"));
      const pdfBuffer = Buffer.from("%PDF-1.4 binary...");

      const result = await statementExtractService.extractStatementFromUpload({
        filename: "statement.pdf",
        buffer: pdfBuffer,
        userId: 9,
      });

      expect(getDocumentProxy).toHaveBeenCalledWith(
        new Uint8Array(pdfBuffer),
      );
      expect(result.source).toBe("pdf");
      expect(result.lines).toEqual([]);
      expect(result.warnings).toContain(
        "No text layer found in this PDF. Upload a CSV/OFX export instead.",
      );
      expect(result.warnings).toContain(
        "No statement lines were extracted.",
      );
      expect(loggedChatCompletion).not.toHaveBeenCalled();
    });

    it("parses a well-formed statement text without calling the LLM", async () => {
      extractText.mockResolvedValue({ text: FULL_PDF_TEXT });

      const result = await statementExtractService.extractStatementFromUpload({
        filename: "statement.pdf",
        buffer: Buffer.from("%PDF-1.4"),
        userId: 9,
      });

      expect(result.source).toBe("pdf");
      expect(result.startDate).toBe("2024-06-01");
      expect(result.endDate).toBe("2024-06-30");
      expect(result.openingBalance).toBe(1000);
      expect(result.incomeTotal).toBe(200);
      expect(result.expenseTotal).toBe(50);
      expect(result.endingBalance).toBe(1150);
      expect(result.controlExpectedEnding).toBe(1150);
      expect(result.controlOk).toBe(true);
      expect(result.warnings).toEqual([]);
      expect(result.lines).toEqual([
        {
          date: "2024-06-01",
          description: "ACME Payroll",
          amount: 200,
          lineType: "Deposit",
        },
        {
          date: "2024-06-05",
          description: "STARBUCKS",
          amount: -5,
          lineType: null,
        },
        {
          date: "2024-06-06",
          description: "Grocery Mart",
          amount: -45,
          lineType: "POS",
        },
      ]);
      expect(loggedChatCompletion).not.toHaveBeenCalled();
    });

    it("falls back to the LLM when the parsed text is incomplete", async () => {
      extractText.mockResolvedValue({
        text: [
          "Statement period Jun 1, 2024 thru Jun 30, 2024",
          "Jun 3 MISC CHARGE 12.50",
        ].join("\n"),
      });
      loggedChatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                startDate: "2024-06-01",
                endDate: "2024-06-30",
                openingBalance: 100,
                endingBalance: 200,
                incomeTotal: 110,
                expenseTotal: -10,
                lines: [
                  { date: "2024-06-02", description: "A", amount: 50 },
                  { date: "Jun 3, 2024", description: "B", amount: 60 },
                  { date: "2024-06-04", description: "C", amount: -10 },
                ],
              }),
            },
          },
        ],
      });

      const result = await statementExtractService.extractStatementFromUpload({
        filename: "statement.pdf",
        buffer: Buffer.from("%PDF-1.4"),
        userId: 9,
      });

      expect(loggedChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: "statement_extract",
          metadata: { userId: 9, charCount: expect.any(Number) },
          body: expect.objectContaining({ model: "gpt-5-mini" }),
        }),
      );
      expect(result.source).toBe("llm");
      expect(result.startDate).toBe("2024-06-01");
      expect(result.endDate).toBe("2024-06-30");
      expect(result.openingBalance).toBe(100);
      expect(result.endingBalance).toBe(200);
      expect(result.incomeTotal).toBe(110);
      expect(result.expenseTotal).toBe(-10);
      expect(result.lines).toEqual([
        {
          date: "2024-06-02",
          description: "A",
          amount: 50,
          lineType: null,
        },
        {
          date: "2024-06-03",
          description: "B",
          amount: 60,
          lineType: null,
        },
        {
          date: "2024-06-04",
          description: "C",
          amount: -10,
          lineType: null,
        },
      ]);
      expect(result.controlOk).toBe(true);
      expect(result.controlExpectedEnding).toBe(200);
    });

    it("keeps the PDF result when no OpenAI client is available", async () => {
      getOpenAIClient.mockReturnValue(null);
      extractText.mockResolvedValue({
        text: [
          "Statement period Jun 1, 2024 thru Jun 30, 2024",
          "Jun 3 MISC CHARGE 12.50",
        ].join("\n"),
      });

      const result = await statementExtractService.extractStatementFromUpload({
        filename: "statement.pdf",
        buffer: Buffer.from("%PDF-1.4"),
        userId: 9,
      });

      expect(result.source).toBe("pdf");
      expect(result.lines).toHaveLength(1);
      expect(loggedChatCompletion).not.toHaveBeenCalled();
      expect(result.warnings).toContain(
        "Could not read opening and ending balances.",
      );
    });

    it("merges LLM warnings into the PDF result when the LLM found fewer lines", async () => {
      extractText.mockResolvedValue({
        text: [
          "Statement period Jun 1, 2024 thru Jun 30, 2024",
          "Starting Balance",
          "$1,000.00   $10.00   $5.00   $1,500.00",
          "Jun 1 ACME 10.00",
          "Jun 2 B CORP 5.00",
        ].join("\n"),
      });
      loggedChatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                lines: [
                  { date: "2024-06-01", description: "ACME", amount: 10 },
                ],
              }),
            },
          },
        ],
      });

      const result = await statementExtractService.extractStatementFromUpload({
        filename: "statement.pdf",
        buffer: Buffer.from("%PDF-1.4"),
        userId: 9,
      });

      expect(result.source).toBe("pdf");
      expect(result.lines).toHaveLength(2);
      expect(result.controlOk).toBe(false);
      expect(result.warnings).toContain(
        "Extracted lines do not roll opening balance to the statement ending balance.",
      );
      expect(result.warnings).toContain(
        "Could not read opening and ending balances.",
      );
    });
  });
});
