import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type E2EContext = {
  email: string;
  password: string;
  userId: number;
  budgetId: number;
  accountId: string;
  checkingRegisterId: number;
  savingsRegisterId: number;
  categoryId: string;
  reoccurrenceId: number;
  savingsGoalId: number;
};

/** Seed payload written by global-setup (`tests/e2e/.e2e-context.json`). */
export function loadE2EContext(): E2EContext {
  const contextPath = path.join(__dirname, "..", ".e2e-context.json");
  const raw = readFileSync(contextPath, "utf-8");
  return JSON.parse(raw) as E2EContext;
}
