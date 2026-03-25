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
    await page.getByRole("button", { name: /open table filters/i }).click();
    await expect(page.locator("#search")).toBeVisible();
  });

  test("add entry opens modal", async ({ page, e2e }) => {
    await page.goto(`/register/${e2e.checkingRegisterId}`);
    await page.getByRole("button", { name: /add entry/i }).first().click();
    await expect(page.getByLabel(/description/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press("Escape");
  });

  test("future and past tabs switch register view", async ({ page, e2e }) => {
    await page.goto(`/register/${e2e.checkingRegisterId}`);
    await expect(page.getByText("E2E seeded transaction")).toBeVisible({
      timeout: 45_000,
    });
    const tablist = page.getByRole("tablist", {
      name: /register time range/i,
    });
    await expect(tablist).toBeVisible();
    const futureTab = tablist.getByRole("tab", { name: /^future$/i });
    const pastTab = tablist.getByRole("tab", { name: /^past$/i });
    await expect(futureTab).toBeVisible();
    await expect(pastTab).toBeVisible();
    await pastTab.click();
    await expect(pastTab).toHaveAttribute("aria-selected", "true");
    await futureTab.click();
    await expect(futureTab).toHaveAttribute("aria-selected", "true");
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
