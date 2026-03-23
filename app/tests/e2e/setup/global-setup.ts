import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FullConfig } from "@playwright/test";
import { postE2ESeed } from "../utils/staging-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
  const token = process.env.E2E_SEED_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "E2E_SEED_TOKEN is required for Playwright (seed API + authed tests).",
    );
  }

  const data = await postE2ESeed(baseURL, token);
  const contextPath = path.join(__dirname, "..", ".e2e-context.json");
  mkdirSync(path.dirname(contextPath), { recursive: true });
  writeFileSync(contextPath, JSON.stringify(data, null, 2), "utf-8");
}
