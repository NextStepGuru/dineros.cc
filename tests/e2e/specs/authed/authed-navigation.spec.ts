import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Authed shell & header navigation", () => {
  test("home shows sign out and main nav", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("banner");
    await expect(
      banner.getByRole("button", { name: /^sign out$/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      banner.getByRole("link", { name: /^accounts$/i }),
    ).toBeVisible();
  });

  test("primary nav links reach core routes", async ({ page, e2e }) => {
    const banner = page.getByRole("banner");

    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });

    await banner.getByRole("link", { name: /^help$/i }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole("heading", { name: /^help$/i })).toBeVisible({
      timeout: 15_000,
    });

    await banner.getByRole("link", { name: /^goals$/i }).first().click();
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.getByText("E2E Emergency Fund")).toBeVisible({
      timeout: 15_000,
    });

    await banner.getByRole("link", { name: /^recurring$/i }).click();
    await expect(page).toHaveURL(/\/reoccurrences$/);
    await expect(page.getByText("E2E Monthly Bill")).toBeVisible({
      timeout: 15_000,
    });

    await banner.getByRole("link", { name: /^reports$/i }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(
      page.getByRole("heading", { name: /category reports/i }),
    ).toBeVisible({ timeout: 15_000 });

    await banner.getByRole("link", { name: /^accounts$/i }).click();
    await expect(page).toHaveURL(/\/account-registers$/);

    await banner.getByRole("link", { name: /^register$/i }).click();
    await expect(page).toHaveURL(
      new RegExp(`/register/${e2e.checkingRegisterId}`),
    );
  });

  test("color mode button is present in header", async ({ page }) => {
    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });
    const banner = page.getByRole("banner");
    const buttons = banner.getByRole("button");
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
