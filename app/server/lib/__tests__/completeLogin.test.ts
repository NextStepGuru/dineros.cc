import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: unknown) => handler);
});

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler: unknown) => handler),
  setCookie: vi.fn(),
}));

const envState = vi.hoisted(() => ({ NODE_ENV: "test" as string | undefined }));
vi.mock("~/server/env", () => ({ default: envState }));

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

const sign = vi.fn();
vi.mock("~/server/services/JwtService", () => ({
  default: class {
    sign = sign;
  },
}));

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    nowDate: vi.fn(() => new Date("2024-06-15T08:00:00.000Z")),
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import { setCookie } from "h3";
// eslint-disable-next-line import/first -- mocks must be registered first
import { prisma } from "~/server/clients/prismaClient";
// eslint-disable-next-line import/first -- mocks must be registered first
import { completeLogin } from "../completeLogin";

const dbUser = {
  id: 42,
  firstName: "Jeremy",
  lastName: "D",
  email: "jeremy@example.com",
  countryId: 840,
  timezoneOffset: null,
  isDaylightSaving: null,
  settings: {},
};

describe("completeLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.NODE_ENV = "test";
    (prisma.user.update as any).mockResolvedValue(dbUser);
    sign.mockResolvedValue("signed-jwt");
  });

  it("signs a jwt for the user, stamps lastAccessedAt, and sets the auth cookie", async () => {
    const event = {};

    const result = await completeLogin(event, 42);

    expect(sign).toHaveBeenCalledWith({ userId: 42 });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { lastAccessedAt: new Date("2024-06-15T08:00:00.000Z") },
    });
    expect(setCookie).toHaveBeenCalledWith(event, "authToken", "signed-jwt", {
      secure: false,
      maxAge: 86400,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
    expect(result.token).toBe("signed-jwt");
    expect(result.message).toBeNull();
    expect(result.user).toMatchObject({ id: 42, role: "USER", isAdmin: false });
  });

  it("marks the cookie secure in production", async () => {
    envState.NODE_ENV = "production";

    await completeLogin({}, 42);

    expect(setCookie).toHaveBeenCalledWith(
      expect.anything(),
      "authToken",
      "signed-jwt",
      expect.objectContaining({ secure: true }),
    );
  });
});
