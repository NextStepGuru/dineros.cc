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

  test("notifications tab loads", async ({ page }) => {
    await page.goto("/edit-profile/notifications");
    await expect(page.getByRole("heading", { name: /^notifications$/i })).toBeVisible(
      { timeout: 30_000 },
    );
    await expect(page.getByText(/banking \(plaid\)/i)).toBeVisible();
  });

  test("team tab loads", async ({ page }) => {
    await page.goto("/edit-profile/team");
    await expect(
      page.getByRole("heading", { name: /team & invitations/i }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("sync accounts tab loads", async ({ page }) => {
    await page.goto("/edit-profile/sync-accounts");
    await expect(
      page.getByRole("heading", { name: /^sync accounts$/i }),
    ).toBeVisible({ timeout: 45_000 });
  });

  test("two-factor auth tab loads", async ({ page }) => {
    await page.goto("/edit-profile/two-factor-auth");
    await expect(
      page.getByRole("heading", { name: /two-factor authentication/i }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
