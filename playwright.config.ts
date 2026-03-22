import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const authStoragePath = path.join(__dirname, ".auth", "user.json");

export default defineConfig({
  testDir: "./tests/e2e/specs",
  globalSetup: path.join(__dirname, "tests/e2e/setup/global-setup.ts"),
  globalTeardown: path.join(__dirname, "tests/e2e/setup/global-teardown.ts"),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { open: process.env.CI ? "never" : "on-failure" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL: playwrightBaseUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "auth-setup",
      testDir: "./tests/e2e/setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-public",
      testDir: "./tests/e2e/specs/public",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-authed",
      testDir: "./tests/e2e/specs/authed",
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStoragePath,
      },
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
            E2E: "1",
          },
        },
      }
    : {}),
});
