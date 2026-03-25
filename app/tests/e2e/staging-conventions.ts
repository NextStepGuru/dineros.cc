/**
 * Post-deploy E2E against shared staging (`https://staging.dineros.cc`).
 *
 * - **Seed API**: `POST /api/e2e/seed` with header `x-e2e-token: <E2E_SEED_TOKEN>` creates
 *   user `e2e-test@dineros.cc` and workspace data. Requires `DEPLOY_ENV=staging` (or local + `E2E=1`).
 * - **CI**: GitHub Actions `staging-e2e` job sets `E2E_SEED_TOKEN` and runs Playwright global setup → auth setup → specs.
 * - **Cleanup**: `POST /api/e2e/cleanup` (same token) removes the E2E user; also runs in global teardown.
 *
 * Legacy env (optional, unused by the current suite):
 * - `E2E_STAGING_USER_EMAIL` / `E2E_STAGING_USER_PASSWORD`
 */
export function getStagingE2ECredentials(): {
  email: string;
  password: string;
} | null {
  const email = process.env.E2E_STAGING_USER_EMAIL?.trim();
  const password = process.env.E2E_STAGING_USER_PASSWORD?.trim();
  if (!email || !password) return null;
  return { email, password };
}
