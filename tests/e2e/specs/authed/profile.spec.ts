import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Edit profile", () => {
  test("profile tab loads", async ({ page }) => {
    await page.goto("/edit-profile/profile");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/profile|name|email/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("profile form is populated with seed user", async ({ page }) => {
    await page.goto("/edit-profile/profile");
    await expect(page.locator("#firstName")).toHaveValue("E2E", {
      timeout: 30_000,
    });
    await expect(page.locator("#lastName")).toHaveValue("Test");
    await expect(page.locator("#email")).toHaveValue("e2e-test@dineros.cc");
  });

  test("can open password tab", async ({ page }) => {
    await page.goto("/edit-profile/profile");
    await page.locator('a[href="/edit-profile/password"]').click();
    await expect(page).toHaveURL(/\/edit-profile\/password/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("password tab shows new and confirm password fields", async ({
    page,
  }) => {
    await page.goto("/edit-profile/password");
    await expect(
      page.getByRole("heading", { name: /change password/i }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#newPassword")).toBeVisible();
    await expect(page.locator("#confirmPassword")).toBeVisible();
  });

  test("notifications tab loads", async ({ page }) => {
    await page.goto("/edit-profile/notifications");
    await expect(page.getByRole("heading", { name: /^notifications$/i })).toBeVisible(
      { timeout: 30_000 },
    );
    await expect(page.getByText(/banking \(plaid\)/i)).toBeVisible();
  });

  test("notifications tab has toggle fields", async ({ page }) => {
    await page.goto("/edit-profile/notifications");
    await expect(page.getByRole("heading", { name: /^notifications$/i })).toBeVisible(
      { timeout: 30_000 },
    );
    await expect(page.getByText(/transaction sync summary/i)).toBeVisible();
    await expect(page.getByText(/bank connection issues/i)).toBeVisible();
  });

  test("team tab loads", async ({ page }) => {
    await page.goto("/edit-profile/team");
    await expect(
      page.getByRole("heading", { name: /team & invitations/i }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("team tab has invite form and empty state", async ({ page }) => {
    await page.goto("/edit-profile/team");
    await expect(
      page.getByRole("heading", { name: /team & invitations/i }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel(/^account$/i)).toBeVisible();
    await expect(page.getByLabel(/email to invite/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /send invitation/i }),
    ).toBeVisible();
    await expect(page.getByText(/no pending invitations/i)).toBeVisible();
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
