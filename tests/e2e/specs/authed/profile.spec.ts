import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Edit profile", () => {
  test("profile tab loads", async ({ page }) => {
    await page.goto("/edit-profile/profile");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/profile|name|email/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("can open password tab", async ({ page }) => {
    await page.goto("/edit-profile/profile");
    await page.locator('a[href="/edit-profile/password"]').click();
    await expect(page).toHaveURL(/\/edit-profile\/password/);
    await expect(page.locator("body")).toBeVisible();
  });
});
