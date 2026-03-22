/**
 * Conventions for post-deploy E2E against shared staging (`https://staging.dineros.cc`).
 *
 * - **Shared environment**: The latest PR deploy wins; avoid tests that assume exclusive DB state unless you gate runs.
 * - **Current suite**: Most specs mock API routes (`page.route`); they do not mutate staging data and are safe to run in parallel.
 * - **Live API tests** (if you add them): Use a dedicated staging-only user, keep flows idempotent (same outcome on re-run), and prefer
 *   `test.describe.configure({ mode: "serial" })` for tests touching one account.
 *
 * Optional credentials for live flows — set in GitHub Actions repository secrets and pass as env to the `staging-e2e` job:
 * - `E2E_STAGING_USER_EMAIL`
 * - `E2E_STAGING_USER_PASSWORD`
 *
 * Read via {@link getStagingE2ECredentials}; returns `null` if either is unset.
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
