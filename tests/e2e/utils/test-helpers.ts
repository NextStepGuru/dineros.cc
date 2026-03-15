import { Page, expect } from "@playwright/test";

export class TestHelpers {
  constructor(private _page: Page) {}

  get page(): Page {
    return this._page;
  }

  /**
   * Wait for page to be fully loaded
   */
  async waitForPageLoad() {
    await this.page.waitForLoadState("networkidle");
  }

  /**
   * Fill in login form with provided credentials
   */
  async fillLoginForm(email: string, password: string) {
    await this.page.getByLabel(/email address/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
  }

  /**
   * Submit login form
   */
  async submitLoginForm() {
    await this.page.getByRole("button", { name: /login/i }).click();
  }

  /**
   * Complete full login flow
   */
  async login(email: string, password: string) {
    await this.fillLoginForm(email, password);
    await this.submitLoginForm();
  }

  /**
   * Mock API response for consistent testing
   */
  async mockApiResponse(url: string, response: any) {
    await this.page.route(url, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(response),
      });
    });
  }

  /**
   * Mock API error response
   */
  async mockApiError(
    url: string,
    status: number = 500,
    message: string = "Internal server error"
  ) {
    await this.page.route(url, async (route) => {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: message }),
      });
    });
  }

  /**
   * Mock network failure
   */
  async mockNetworkFailure(url: string) {
    await this.page.route(url, async (route) => {
      await route.abort("failed");
    });
  }

  /**
   * Wait for and verify toast notification
   */
  async expectToast(
    message: string,
    _type: "success" | "error" | "warning" = "success"
  ) {
    const toast = this.page.locator(
      `[data-testid="toast"], .toast, [role="alert"]`
    );
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(message);
  }

  /**
   * Wait for and verify form validation error
   */
  async expectValidationError(field: string, message: string) {
    const error = this.page.locator(
      `[data-testid="${field}-error"], [aria-describedby*="${field}"]`
    );
    await expect(error).toBeVisible();
    await expect(error).toContainText(message);
  }

  /**
   * Navigate to page and wait for load
   */
  async navigateTo(path: string) {
    await this.page.goto(path);
    await this.waitForPageLoad();
  }

  /**
   * Check if element is visible and enabled
   */
  async expectElementReady(selector: string) {
    const element = this.page.locator(selector);
    await expect(element).toBeVisible();
    await expect(element).toBeEnabled();
  }

  /**
   * Fill form field with validation
   */
  async fillField(label: string, value: string) {
    const field = this.page.getByLabel(new RegExp(label, "i"));
    await field.fill(value);
    await expect(field).toHaveValue(value);
  }

  /**
   * Click button and wait for action
   */
  async clickButton(text: string) {
    const button = this.page.getByRole("button", {
      name: new RegExp(text, "i"),
    });
    await button.click();
    // Wait a bit for any async actions
    await this.page.waitForTimeout(100);
  }
}

/**
 * Create test helpers instance
 */
export function createTestHelpers(page: Page): TestHelpers {
  return new TestHelpers(page);
}
