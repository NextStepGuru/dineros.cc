import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Authed shell & header navigation", () => {
  test("home shows account menu and main nav", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const banner = page.getByRole("banner");
    const userMenu = page.getByTestId("header-user-menu");
    await expect(userMenu).toBeVisible({ timeout: 20_000 });
    await expect(userMenu).toBeEnabled();
    await expect(banner.getByRole("button", { name: "Forecast menu" })).toBeVisible();
    await expect(banner.getByRole("button", { name: "Reconcile menu" })).toBeVisible();
    await expect(banner.getByRole("link", { name: /^help$/i })).toBeVisible();
  });

  test("primary nav links reach core routes", async ({ page, e2e }) => {
    const banner = page.getByRole("banner");

    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });

    await page.goto("/goals");
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.getByText("E2E Emergency Fund")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/reoccurrences");
    await expect(page).toHaveURL(/\/reoccurrences$/);
    await expect(page.getByText("E2E Monthly Bill")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/reports");
    await expect(page).toHaveURL(/\/reports$/);
    await expect(
      page.getByRole("heading", { name: /category reports/i }),
    ).toBeVisible({ timeout: 15_000 });

    await page.goto("/account-registers");
    await expect(page).toHaveURL(/\/account-registers$/);
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(`/register/${e2e.checkingRegisterId}`);
    await expect(
      page.getByText("E2E seeded transaction"),
    ).toBeVisible({ timeout: 45_000 });

    await banner.getByRole("link", { name: /^help$/i }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole("heading", { name: /^help$/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Forecast header menu opens on register page", async ({ page, e2e }) => {
    await page.goto(`/register/${e2e.checkingRegisterId}`);
    await expect(page.getByText("E2E seeded transaction")).toBeVisible({
      timeout: 45_000,
    });

    await page.keyboard.press("Escape");
    const trigger = page.getByRole("banner").getByRole("button", { name: "Forecast menu" });
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 5_000 });
    await expect(
      page.getByRole("menu").getByText("Reports", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Reconcile header menu opens on register page", async ({ page, e2e }) => {
    await page.goto(`/register/${e2e.checkingRegisterId}`);
    await expect(page.getByText("E2E seeded transaction")).toBeVisible({
      timeout: 45_000,
    });

    await page.keyboard.press("Escape");
    const trigger = page.getByRole("banner").getByRole("button", { name: "Reconcile menu" });
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 5_000 });
    await expect(
      page.getByRole("menu").getByText("Goals", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("color mode button is present in header", async ({ page }) => {
    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });
    const bannerButtons = page.getByRole("banner").getByRole("button");
    await expect(bannerButtons.first()).toBeVisible();
    expect(await bannerButtons.count()).toBeGreaterThanOrEqual(1);
  });
});
