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

test.describe("Contact form validation", () => {
  test("empty submit does not navigate away", async ({ page }) => {
    await page.goto("/contact");
    await expect(
      page.getByRole("heading", { name: /^contact us$/i }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /^send message$/i }).click();
    await page.waitForTimeout(1_000);

    await expect(page).toHaveURL(/\/contact/);
    await expect(
      page.getByRole("button", { name: /^send message$/i }),
    ).toBeVisible();
  });

  test("invalid email does not submit", async ({ page }) => {
    await page.goto("/contact");
    await expect(
      page.getByRole("heading", { name: /^contact us$/i }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByLabel(/^name$/i).fill("Test User");
    await page.getByLabel(/^email$/i).fill("not-an-email");
    await page.getByLabel(/^message$/i).fill("This is a valid length message for testing.");
    await page.getByRole("button", { name: /^send message$/i }).click();
    await page.waitForTimeout(1_000);

    await expect(page).toHaveURL(/\/contact/);
    await expect(
      page.getByRole("button", { name: /^send message$/i }),
    ).toBeVisible();
  });

  test("short message does not submit", async ({ page }) => {
    await page.goto("/contact");
    await expect(
      page.getByRole("heading", { name: /^contact us$/i }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByLabel(/^name$/i).fill("Test User");
    await page.getByLabel(/^email$/i).fill("test@example.com");
    await page.getByLabel(/^message$/i).fill("Short");
    await page.getByRole("button", { name: /^send message$/i }).click();
    await page.waitForTimeout(1_000);

    await expect(page).toHaveURL(/\/contact/);
    await expect(
      page.getByRole("button", { name: /^send message$/i }),
    ).toBeVisible();
  });
});
