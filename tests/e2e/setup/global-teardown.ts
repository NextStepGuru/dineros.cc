import type { FullConfig } from "@playwright/test";
import { postE2ECleanup } from "../utils/staging-api";

export default async function globalTeardown(
  _config: FullConfig,
): Promise<void> {
  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
  const token = process.env.E2E_SEED_TOKEN?.trim();
  if (!token) {
    return;
  }
  try {
    await postE2ECleanup(baseURL, token);
  } catch {
    // Best-effort cleanup
  }
}
