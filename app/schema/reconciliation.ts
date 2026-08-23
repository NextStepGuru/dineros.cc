import { z } from "zod";

export const extractedStatementLineSchema = z.object({
  date: z.string().min(10),
  description: z.string().min(1).max(1500),
  amount: z.coerce.number(),
  lineType: z.string().max(64).nullable().optional(),
});

export const openReconciliationPeriodSchema = z.object({
  budgetId: z.coerce.number().int().positive(),
  accountRegisterId: z.coerce.number().int().positive(),
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  statementOpeningBalance: z.coerce.number().default(0),
  statementEndingBalance: z.coerce.number(),
  statementIncomeTotal: z.coerce.number().nullable().optional(),
  statementExpenseTotal: z.coerce.number().nullable().optional(),
  statementLines: z.array(extractedStatementLineSchema).max(5000).optional(),
});

export const closeReconciliationPeriodSchema = z.object({
  closeNote: z.string().max(500).nullable().optional(),
});

export const patchStatementLineSchema = z.object({
  ignore: z.boolean().optional(),
  registerEntryId: z.string().min(1).nullable().optional(),
  createLedgerEntry: z.boolean().optional(),
});

export const importStatementLinesSchema = z.object({
  statementLineIds: z
    .array(z.coerce.number().int().positive())
    .max(5000)
    .optional(),
});
