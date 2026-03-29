import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as setup, expect } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

setup("authenticate and save storage state", async ({ page }) => {
  const contextPath = path.join(__dirname, "..", ".e2e-context.json");
  const raw = readFileSync(contextPath, "utf-8");
  const { email, password } = JSON.parse(raw) as {
    email: string;
    password: string;
  };

  await page.goto("/login");
  await page.getByLabel(/email address/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForURL(
    (url) =>
      url.pathname.startsWith("/register/") ||
      url.pathname.startsWith("/account-registers"),
    { timeout: 60_000 },
  );

  // Persisted storage state must match what register/header e2e expect (forecasting toolbar + menus).
  await page.evaluate(() => {
    try {
      localStorage.setItem("dineros_workflow_mode", "forecasting");
    } catch {
      /* ignore */
    }
  });

  const authDir = path.join(__dirname, "..", "..", "..", ".auth");
  mkdirSync(authDir, { recursive: true });
  const storagePath = path.join(authDir, "user.json");
  await page.context().storageState({ path: storagePath });

  await expect(page.locator("body")).toBeVisible();
});
