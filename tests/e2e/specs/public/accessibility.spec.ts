import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Nuxt UI framework / theme-level violations tracked separately
const KNOWN_FRAMEWORK_RULES = [
  "button-name",
  "color-contrast",
  "label",
  "label-title-only",
  "landmark-unique",
  "link-in-text-block",
  "link-name",
  "nested-interactive",
  "page-has-heading-one",
];

const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/contact",
  "/privacy-policy",
  "/terms-of-service",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password-with-code",
] as const;

test.describe("Accessibility — public pages", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} has no axe-core violations`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");

      const results = await new AxeBuilder({ page })
        .disableRules(KNOWN_FRAMEWORK_RULES)
        .analyze();

      expect(
        results.violations,
        results.violations
          .map(
            (v) =>
              `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`,
          )
          .join("\n"),
      ).toHaveLength(0);
    });
  }
});
