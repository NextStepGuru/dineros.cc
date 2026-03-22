import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Register entries", () => {
  test("shows seeded transaction on register view", async ({ page, e2e }) => {
    await page.goto(`/register/${e2e.checkingRegisterId}`);
    await expect(page.getByText("E2E seeded transaction")).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText(/E2E Checking/i).first()).toBeVisible();
  });

  test("add entry opens modal", async ({ page, e2e }) => {
    await page.goto(`/register/${e2e.checkingRegisterId}`);
    await page.getByRole("button", { name: /add entry/i }).first().click();
    await expect(page.getByLabel(/description/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press("Escape");
  });
});
