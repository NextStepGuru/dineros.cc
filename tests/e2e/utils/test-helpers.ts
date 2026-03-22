import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export class TestHelpers {
  constructor(private readonly _page: Page) {}

  get page(): Page {
    return this._page;
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState("domcontentloaded");
  }

  async fillLoginForm(email: string, password: string): Promise<void> {
    await this.page.getByLabel(/email address/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
  }

  async submitLoginForm(): Promise<void> {
    await this.page.getByRole("button", { name: /sign in/i }).click();
  }

  async login(email: string, password: string): Promise<void> {
    await this.fillLoginForm(email, password);
    await this.submitLoginForm();
  }

  async navigateTo(path: string): Promise<void> {
    await this.page.goto(path);
    await this.waitForPageLoad();
  }

  /** Nuxt UI toast / alert region */
  async expectVisibleToastMatching(pattern: RegExp): Promise<void> {
    const alert = this.page.getByRole("alert");
    await expect(alert.filter({ hasText: pattern }).first()).toBeVisible({
      timeout: 15_000,
    });
  }

  async signOut(): Promise<void> {
    const signOutLink = this.page.getByRole("link", { name: /sign out/i });
    const signOutButton = this.page.getByRole("button", { name: /sign out/i });
    if (await signOutLink.isVisible().catch(() => false)) {
      await signOutLink.click();
    } else if (await signOutButton.isVisible().catch(() => false)) {
      await signOutButton.click();
    } else {
      await this.page.getByText(/^sign out$/i).first().click();
    }
    await this.page.waitForURL(/\/$|\/login/, { timeout: 15_000 });
  }
}

export function createTestHelpers(page: Page): TestHelpers {
  return new TestHelpers(page);
}
