import { test as base } from "@playwright/test";
import type { E2EContext } from "../utils/e2e-context";
import { loadE2EContext } from "../utils/e2e-context";

export const test = base.extend<{ e2e: E2EContext }>({
  e2e: async ({}, use) => {
    await use(loadE2EContext());
  },
});

export { expect } from "@playwright/test";
