import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Help (authed)", () => {
  test("help page loads with main content", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: /^help$/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("#recent-updates")).toBeVisible();
  });

  test("key sections and shortcuts table exist", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: /^help$/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("#first-time")).toBeVisible();
    await expect(page.locator("#budgets")).toBeVisible();
    await expect(page.locator("#shortcuts")).toBeVisible();
    await expect(page.locator("#troubleshooting")).toBeVisible();
    const shortcutsTable = page.locator("#shortcuts table");
    await expect(shortcutsTable).toBeVisible();
    await expect(shortcutsTable.locator("th").filter({ hasText: /action/i })).toBeVisible();
    await expect(shortcutsTable.locator("th").filter({ hasText: /keys/i })).toBeVisible();
  });

  test("contact support link at bottom", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: /^help$/i })).toBeVisible({
      timeout: 30_000,
    });
    const contactLinks = page.getByRole("link", { name: /contact support/i });
    await expect(contactLinks.last()).toBeVisible();
    await expect(contactLinks.last()).toHaveAttribute("href", "/contact");
  });
});
