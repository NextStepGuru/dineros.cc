import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Reports", () => {
  test("page loads", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.locator("body")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /category reports/i }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("report mode and filters are visible", async ({ page }) => {
    await page.goto("/reports");
    await expect(
      page.getByRole("heading", { name: /category reports/i }),
    ).toBeVisible({ timeout: 30_000 });

    const modeGroup = page.getByRole("group", { name: /report mode/i });
    await expect(modeGroup).toBeVisible();
    await expect(modeGroup.getByRole("button", { name: /^past$/i })).toBeVisible();
    await expect(
      modeGroup.getByRole("button", { name: /future.*forecast/i }),
    ).toBeVisible();

    await expect(page.getByLabel(/^from$/i)).toBeVisible();
    await expect(page.getByLabel(/^to$/i)).toBeVisible();
    await expect(page.getByLabel(/^register$/i)).toBeVisible();
  });
});
