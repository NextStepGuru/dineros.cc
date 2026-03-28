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

function resolveLocalWebServerTarget(url: string): {
  host: string;
  port: number;
  origin: string;
} {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname || "localhost";
    const port = parsed.port ? Number(parsed.port) : 4300;
    const protocol = parsed.protocol || "http:";
    return { host, port, origin: `${protocol}//${host}:${port}` };
  } catch {
    return { host: "localhost", port: 4300, origin: "http://localhost:4300" };
  }
}

const playwrightBaseUrlRaw = process.env.PLAYWRIGHT_BASE_URL?.trim();
const playwrightBaseUrl =
  playwrightBaseUrlRaw && playwrightBaseUrlRaw.length > 0
    ? playwrightBaseUrlRaw
    : "http://localhost:4300";

const useLocalWebServer =
  !playwrightBaseUrlRaw ||
  playwrightBaseUrlRaw.length === 0 ||
  isLocalPlaywrightBase(playwrightBaseUrl);
const localWebServerTarget = resolveLocalWebServerTarget(playwrightBaseUrl);
const localPortOverride = Number.parseInt(
  process.env.PLAYWRIGHT_LOCAL_PORT?.trim() ?? "",
  10,
);
const localWebServerPort = Number.isFinite(localPortOverride)
  ? localPortOverride
  : 4300;
const effectiveLocalTarget = {
  host: localWebServerTarget.host,
  port: localWebServerPort,
  origin: `http://${localWebServerTarget.host}:${localWebServerPort}`,
};
const effectiveBaseUrl = useLocalWebServer
  ? effectiveLocalTarget.origin
  : playwrightBaseUrl;
process.env.PLAYWRIGHT_BASE_URL = effectiveBaseUrl;

const isCi =
  process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

const authStoragePath = path.join(__dirname, ".auth", "user.json");

export default defineConfig({
  testDir: "./tests/e2e/specs",
  globalSetup: path.join(__dirname, "tests/e2e/setup/global-setup.ts"),
  globalTeardown: path.join(__dirname, "tests/e2e/setup/global-teardown.ts"),
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: isCi ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { open: isCi ? "never" : "on-failure" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL: effectiveBaseUrl,
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
    {
      name: "webkit-public",
      testDir: "./tests/e2e/specs/public",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "webkit-authed",
      testDir: "./tests/e2e/specs/authed",
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Safari"],
        storageState: authStoragePath,
      },
    },
    {
      name: "mobile-public",
      testDir: "./tests/e2e/specs/public",
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "mobile-authed",
      testDir: "./tests/e2e/specs/authed",
      dependencies: ["auth-setup"],
      use: {
        ...devices["iPhone 14"],
        storageState: authStoragePath,
      },
    },
  ],
  ...(useLocalWebServer
    ? {
        webServer: {
          command: `pnpm dev --port ${effectiveLocalTarget.port} --host ${effectiveLocalTarget.host}`,
          url: effectiveLocalTarget.origin,
          reuseExistingServer: !isCi,
          // Nuxt cold compile can exceed 60s locally; CI is typically slower.
          timeout: isCi ? 360_000 : 180_000,
          env: {
            ...process.env,
            E2E: "1",
          },
        },
      }
    : {}),
});
