import { test, expect } from "../../fixtures/e2e-fixtures";

/** Viewport only — full-page height differs between local dev and staging (scroll length, banners). */
const SCREENSHOT_OPTS = { fullPage: false, maxDiffPixelRatio: 0.03 } as const;
const REPORTS_SCREENSHOT_OPTS = {
  fullPage: false,
  maxDiffPixelRatio: 0.03,
} as const;

test.describe.skip("Visual regression — authed pages", () => {
  test("account registers", async ({ page }) => {
    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveScreenshot(
      "account-registers.png",
      SCREENSHOT_OPTS,
    );
  });

  test("goals", async ({ page }) => {
    await page.goto("/goals");
    await expect(page.getByText("E2E Emergency Fund")).toBeVisible({
      timeout: 45_000,
    });
    await expect(page).toHaveScreenshot("goals.png", SCREENSHOT_OPTS);
  });

  test("reoccurrences", async ({ page }) => {
    await page.goto("/reoccurrences");
    await expect(page.getByText("E2E Monthly Bill")).toBeVisible({
      timeout: 45_000,
    });
    await expect(page).toHaveScreenshot("reoccurrences.png", SCREENSHOT_OPTS);
  });

  test("reports", async ({ page }) => {
    await page.goto("/reports");
    await expect(
      page.getByRole("heading", { name: /category reports/i }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveScreenshot("reports.png", REPORTS_SCREENSHOT_OPTS);
  });

  test("help", async ({ page }) => {
    await page.goto("/help");
    await expect(
      page.getByRole("heading", { name: /^help$/i }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/keyboard shortcuts/i).first()).toBeVisible();
  });

  test("edit profile", async ({ page }) => {
    await page.goto("/edit-profile/profile");
    await expect(page.locator("#firstName")).toHaveValue("E2E", {
      timeout: 30_000,
    });
    await expect(page).toHaveScreenshot("edit-profile.png", SCREENSHOT_OPTS);
  });
});
