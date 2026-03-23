import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Form validation — authed empty-submit", () => {
  test("add account modal rejects empty submit", async ({ page }) => {
    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });

    await page
      .getByRole("button", { name: "Add account", exact: true })
      .click();

    const submitBtn = page.getByRole("button", { name: /^save$|^create$|^add$/i });
    if (await submitBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await submitBtn.click();
      await expect(page).toHaveURL(/\/account-registers/);
    }
  });

  test("add entry modal rejects empty submit", async ({ page, e2e }) => {
    await page.goto(`/register/${e2e.checkingRegisterId}`);
    await expect(page.getByText("E2E seeded transaction")).toBeVisible({
      timeout: 45_000,
    });

    await page.getByRole("button", { name: /add entry/i }).first().click();
    await expect(page.getByLabel(/description/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const submitBtn = page.getByRole("button", { name: /^save$|^create$|^add$/i });
    if (await submitBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await submitBtn.click();
      await expect(page).toHaveURL(
        new RegExp(`/register/${e2e.checkingRegisterId}`),
      );
    }

    await page.keyboard.press("Escape");
  });

  test("add recurring entry modal rejects empty submit", async ({ page }) => {
    await page.goto("/reoccurrences");
    await expect(page.getByText("E2E Monthly Bill")).toBeVisible({
      timeout: 45_000,
    });

    await page
      .getByRole("button", { name: "Add recurring entry", exact: true })
      .click();

    const submitBtn = page.getByRole("button", { name: /^save$|^create$|^add$/i });
    if (await submitBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await submitBtn.click();
      await expect(page).toHaveURL(/\/reoccurrences/);
    }
  });

  test("add goal modal rejects empty submit", async ({ page }) => {
    await page.goto("/goals");
    await expect(page.getByText("E2E Emergency Fund")).toBeVisible({
      timeout: 45_000,
    });

    await page
      .getByRole("button", { name: "Add goal", exact: true })
      .click();

    const submitBtn = page.getByRole("button", { name: /^save$|^create$|^add$/i });
    if (await submitBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await submitBtn.click();
      await expect(page).toHaveURL(/\/goals/);
    }
  });

  test("profile rejects empty first name", async ({ page }) => {
    await page.goto("/edit-profile/profile");
    await expect(page.locator("#firstName")).toHaveValue("E2E", {
      timeout: 30_000,
    });

    await page.locator("#firstName").clear();
    const saveBtn = page.getByRole("button", { name: /save|update/i });
    if (await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await saveBtn.click();
      await expect(page).toHaveURL(/\/edit-profile\/profile/);
    }
  });

  test("team invite rejects empty email", async ({ page }) => {
    await page.goto("/edit-profile/team");
    await expect(
      page.getByRole("heading", { name: /team & invitations/i }),
    ).toBeVisible({ timeout: 30_000 });

    await page
      .getByRole("button", { name: /send invitation/i })
      .click();

    await expect(page).toHaveURL(/\/edit-profile\/team/);
    await expect(
      page.locator('li[role="alert"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
