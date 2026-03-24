import { test, expect } from "@playwright/test";

/** Viewport only — stable dimensions across environments (see authed/visual.spec.ts). */
const SCREENSHOT_OPTS = { fullPage: false, maxDiffPixelRatio: 0.01 } as const;

test.describe.skip("Visual regression — public pages", () => {
  test("homepage", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    await expect(page).toHaveScreenshot("homepage.png", SCREENSHOT_OPTS);
  });

  test("about page", async ({ page }) => {
    await page.goto("/about");
    await expect(
      page.getByRole("heading", { name: /about dineros/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveScreenshot("about.png", SCREENSHOT_OPTS);
  });

  test("contact page", async ({ page }) => {
    await page.goto("/contact");
    await expect(
      page.getByRole("heading", { name: /contact us/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveScreenshot("contact.png", SCREENSHOT_OPTS);
  });

  test("login page", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("login.png", SCREENSHOT_OPTS);
  });

  test("signup page", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: /create your account/i }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("signup.png", SCREENSHOT_OPTS);
  });
});
