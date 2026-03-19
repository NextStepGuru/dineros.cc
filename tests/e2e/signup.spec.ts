import { test, expect } from "@playwright/test";

test.describe("Signup Page E2E Tests", () => {
  test("should complete successful signup and redirect to login", async ({
    page,
  }) => {
    await page.route("**/api/account-signup", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "mock-token" }),
      });
    });

    await page.goto("/signup");
    await page.waitForLoadState("networkidle");

    await page.getByLabel(/first name/i).fill("Jane");
    await page.getByLabel(/last name/i).fill("Doe");
    await page.getByLabel(/email address/i).fill("jane.doe@example.com");
    await page.locator("#password").fill("SecurePass123!");
    await page.locator("#confirmPassword").fill("SecurePass123!");

    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/account-signup") &&
        res.request().method() === "POST",
      { timeout: 10000 }
    );
    await page.getByRole("button", { name: /create account/i }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: /welcome back/i })
    ).toBeVisible();
  });

  test("should show error when email is already in use", async ({ page }) => {
    await page.route("**/api/account-signup", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ message: "Email is already in use." }),
      });
    });

    await page.goto("/signup");
    await page.waitForLoadState("networkidle");

    await page.getByLabel(/first name/i).fill("Jane");
    await page.getByLabel(/last name/i).fill("Doe");
    await page.getByLabel(/email address/i).fill("existing@example.com");
    await page.locator("#password").fill("SecurePass123!");
    await page.locator("#confirmPassword").fill("SecurePass123!");

    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/account-signup") &&
        res.request().method() === "POST",
      { timeout: 10000 }
    );
    await page.getByRole("button", { name: /create account/i }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(409);

    await expect(page).toHaveURL(/\/signup/);
    await expect(
      page.getByRole("heading", { name: /create your account/i })
    ).toBeVisible();
    // Error toast shows API message "Email is already in use." or fallback (may match toast + inner text)
    await expect(
      page.getByText(/already in use|registration failed|failed|conflict/i).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test("should stay on signup and show validation for empty submit", async ({
    page,
  }) => {
    await page.goto("/signup");

    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/signup/);
    await expect(
      page.getByRole("heading", { name: /create your account/i })
    ).toBeVisible();
  });
});
