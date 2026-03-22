import { test, expect } from "../../fixtures/e2e-fixtures";
import { createTestHelpers } from "../../utils/test-helpers";

test.describe("Account registers", () => {
  test("lists seeded registers", async ({ page }) => {
    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("E2E Savings")).toBeVisible();
  });

  test("opens add account flow", async ({ page }) => {
    await page.goto("/account-registers");
    await page.getByRole("button", { name: /add account/i }).first().click();
    await expect(page.getByText(/add account/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await page.keyboard.press("Escape");
  });
});

test.describe("Logout (authed)", () => {
  test("sign out clears session", async ({ page }) => {
    await page.goto("/account-registers");
    const helpers = createTestHelpers(page);
    await helpers.signOut();
    const pathname = new URL(page.url()).pathname;
    expect(pathname === "/" || pathname === "/login").toBeTruthy();
  });
});
