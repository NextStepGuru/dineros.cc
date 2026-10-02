import { beforeEach, describe, expect, it, vi } from "vitest";

const envState: { ADMIN_EMAIL?: string } = {};

vi.mock("~/server/env", () => ({ default: envState }));

let adminConfig: typeof import("../adminConfig");

async function freshImport() {
  vi.resetModules();
  adminConfig = await import("../adminConfig");
}

describe("adminConfig", () => {
  beforeEach(async () => {
    delete envState.ADMIN_EMAIL;
    await freshImport();
  });

  it("defaults to admin@dineros.cc when no env email is configured", () => {
    expect(adminConfig.ADMIN_EMAIL).toBe("admin@dineros.cc");
    expect(adminConfig.isAdminEmail("ADMIN@DINEROS.CC")).toBe(true);
  });

  it("uses the configured admin email case-insensitively", async () => {
    envState.ADMIN_EMAIL = "Boss@Example.com";
    await freshImport();

    expect(adminConfig.ADMIN_EMAIL).toBe("Boss@Example.com");
    expect(adminConfig.isAdminEmail("boss@example.com")).toBe(true);
    expect(adminConfig.isAdminEmail("  BOSS@EXAMPLE.COM  ")).toBe(true);
  });

  it("rejects other emails, blanks, and non-strings", async () => {
    envState.ADMIN_EMAIL = "admin@dineros.cc";
    await freshImport();

    expect(adminConfig.isAdminEmail("someone@dineros.cc")).toBe(false);
    expect(adminConfig.isAdminEmail("")).toBe(false);
    expect(adminConfig.isAdminEmail(null)).toBe(false);
    expect(adminConfig.isAdminEmail(undefined)).toBe(false);
  });

  it("ignores whitespace-only env values and keeps the default", async () => {
    envState.ADMIN_EMAIL = "   ";
    await freshImport();

    expect(adminConfig.ADMIN_EMAIL).toBe("admin@dineros.cc");
  });
});
