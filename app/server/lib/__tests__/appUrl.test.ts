import { beforeEach, describe, expect, it, vi } from "vitest";

const envState: { NUXT_PUBLIC_SITE_URL?: string; DEPLOY_ENV?: string } = {};
vi.mock("~/server/env", () => ({ default: envState }));
vi.mock("~/server/logger", () => ({ log: vi.fn() }));

let appUrl: typeof import("../appUrl");

async function freshImport() {
  vi.resetModules();
  appUrl = await import("../appUrl");
}

describe("appUrl", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    delete envState.NUXT_PUBLIC_SITE_URL;
    delete envState.DEPLOY_ENV;
    await freshImport();
  });

  describe("getConfiguredAppBaseUrl", () => {
    it("normalizes a valid site URL and strips the trailing slash", () => {
      envState.NUXT_PUBLIC_SITE_URL = "https://dineros.cc/";

      expect(appUrl.getConfiguredAppBaseUrl()).toBe("https://dineros.cc");
    });

    it("rejects non-http(s) protocols and warns once", async () => {
      envState.NUXT_PUBLIC_SITE_URL = "ftp://dineros.cc";
      envState.DEPLOY_ENV = "local";
      const { log } = await import("~/server/logger");

      expect(appUrl.getConfiguredAppBaseUrl()).toBe("http://localhost:3102");
      expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: "warn" }));

      // The invalid-URL warning fires only once per process.
      appUrl.getConfiguredAppBaseUrl();
      expect(log).toHaveBeenCalledTimes(1);
    });

    it("falls back to localhost in local deploys when the URL is missing", () => {
      envState.DEPLOY_ENV = "local";

      expect(appUrl.getConfiguredAppBaseUrl()).toBe("http://localhost:3102");
    });

    it("returns null and warns once in non-local deploys when the URL is missing", async () => {
      envState.DEPLOY_ENV = "production";
      const { log } = await import("~/server/logger");

      expect(appUrl.getConfiguredAppBaseUrl()).toBeNull();
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ level: "warn" }),
      );

      appUrl.getConfiguredAppBaseUrl();
      expect(log).toHaveBeenCalledTimes(1);
    });

    it("treats a whitespace-only URL as missing", () => {
      envState.NUXT_PUBLIC_SITE_URL = "   ";
      envState.DEPLOY_ENV = "local";

      expect(appUrl.getConfiguredAppBaseUrl()).toBe("http://localhost:3102");
    });
  });

  describe("buildAppUrl", () => {
    it("appends the path to the configured base", () => {
      envState.NUXT_PUBLIC_SITE_URL = "https://app.dineros.cc";

      expect(appUrl.buildAppUrl("/invite/abc")).toBe(
        "https://app.dineros.cc/invite/abc",
      );
      expect(appUrl.buildAppUrl("invite/abc")).toBe(
        "https://app.dineros.cc/invite/abc",
      );
    });

    it("returns null when no base URL can be resolved", () => {
      envState.DEPLOY_ENV = "production";

      expect(appUrl.buildAppUrl("/invite/abc")).toBeNull();
    });
  });
});
