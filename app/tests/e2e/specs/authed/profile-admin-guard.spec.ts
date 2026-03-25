import { test, expect } from "../../fixtures/e2e-fixtures";

const ADMIN_ONLY_PATHS = [
  "/edit-profile/admin-settings",
  "/edit-profile/debug-tools",
  "/edit-profile/openai-logs",
] as const;

test.describe("Admin-only profile routes (non-admin user)", () => {
  for (const path of ADMIN_ONLY_PATHS) {
    test(`${path} renders empty (no admin content)`, async ({ page }) => {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: /^edit profile$/i }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByRole("heading", { name: /admin|debug|openai/i }),
      ).not.toBeVisible({ timeout: 3_000 });
    });
  }
});
