import { defineConfig, devices } from "@playwright/test";

/** When set to a non-loopback URL, Playwright hits that deployment and does not start `pnpm dev`. */
function isLocalPlaywrightBase(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return true;
  }
}

const playwrightBaseUrlRaw = process.env.PLAYWRIGHT_BASE_URL?.trim();
const playwrightBaseUrl =
  playwrightBaseUrlRaw && playwrightBaseUrlRaw.length > 0
    ? playwrightBaseUrlRaw
    : "http://localhost:3000";

const useLocalWebServer =
  !playwrightBaseUrlRaw ||
  playwrightBaseUrlRaw.length === 0 ||
  isLocalPlaywrightBase(playwrightBaseUrl);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: playwrightBaseUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  ...(useLocalWebServer
    ? {
        webServer: {
          command: "pnpm dev",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: process.env.CI ? 180_000 : 60_000,
          env: {
            ...process.env,
            ...(process.env.CI ? { E2E: "1" } : {}),
          },
        },
      }
    : {}),
});
