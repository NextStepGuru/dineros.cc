import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Register entries", () => {
  test("shows seeded transaction on register view", async ({ page, e2e }) => {
    await page.goto(`/register/${e2e.checkingRegisterId}`);
    await expect(page.getByText("E2E seeded transaction")).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText(/E2E Checking/i).first()).toBeVisible();
    await expect(page.getByText(/[−-]\$25\.50/)).toBeVisible();
  });

  test("register toolbar: recalculate, refresh, and filter", async ({
    page,
    e2e,
  }) => {
    await page.goto(`/register/${e2e.checkingRegisterId}`);
    await expect(page.getByText("E2E seeded transaction")).toBeVisible({
      timeout: 45_000,
    });
    const recalc = page.getByRole("button", {
      name: /recalculate forecast/i,
    });
    await expect(recalc).toBeVisible();
    await expect(recalc).toBeEnabled();
    const refresh = page.getByRole("button", { name: /refresh register/i });
    await expect(refresh).toBeVisible();
    await expect(refresh).toBeEnabled();
    const openFilters = page.getByRole("button", { name: /open table filters/i });
    await openFilters.scrollIntoViewIfNeeded();
    await openFilters.click();
    await expect(
      page.getByRole("textbox", { name: /filter table by text/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("add entry opens modal", async ({ page, e2e }) => {
    await page.goto(`/register/${e2e.checkingRegisterId}`);
    const addEntry = page.getByRole("button", { name: /add entry/i }).first();
    await addEntry.scrollIntoViewIfNeeded();
    await addEntry.click();
    const modal = page.getByTestId("register-entry-modal");
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await expect(modal.locator("#description")).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press("Escape");
  });

  test("forecast vs reconcile workspace switches register context", async ({
    page,
    e2e,
  }) => {
    await page.goto(`/register/${e2e.checkingRegisterId}`);
    await expect(page.getByText("E2E seeded transaction")).toBeVisible({
      timeout: 45_000,
    });
    await expect(
      page.getByText(/Projected entries and balances/i),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("header-reconcile-menu-trigger").click();
    const reconMenu = page.locator(".e2e-reconcile-workspace-dropdown");
    const reconRegister = reconMenu.getByText("Register", { exact: true });
    await expect(reconRegister).toBeVisible({ timeout: 15_000 });
    await reconRegister.click();
    await expect(page).toHaveURL(
      new RegExp(`/register/${e2e.checkingRegisterId}`),
    );
    await expect(
      page.getByText(/This view shows cleared and reconciled activity/i),
    ).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await page.getByTestId("header-forecast-menu-trigger").click();
    const fcMenu = page.locator(".e2e-forecast-workspace-dropdown");
    const fcRegister = fcMenu.getByText("Register", { exact: true });
    await expect(fcRegister).toBeVisible({ timeout: 15_000 });
    await fcRegister.click();
    await expect(
      page.getByText(/Projected entries and balances/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("account selector shows current register name", async ({
    page,
    e2e,
  }) => {
    await page.goto(`/register/${e2e.checkingRegisterId}`);
    await expect(page.getByText("E2E seeded transaction")).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText("E2E Checking").first()).toBeVisible();
  });
});
