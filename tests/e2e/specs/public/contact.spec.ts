import { test, expect } from "@playwright/test";

test.describe("Contact page", () => {
  test("contact form and contact information render", async ({ page }) => {
    await page.goto("/contact");
    await expect(
      page.getByRole("heading", { name: /^contact us$/i }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByLabel(/^name$/i)).toBeVisible();
    await expect(page.getByLabel(/^email$/i)).toBeVisible();
    await expect(page.getByLabel(/why are you contacting/i)).toBeVisible();
    await expect(page.getByLabel(/^subject$/i)).toBeVisible();
    await expect(page.getByLabel(/^message$/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^send message$/i }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: /^contact information$/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /support@dineros\.cc/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /615-261-8201/ })).toBeVisible();
  });
});
