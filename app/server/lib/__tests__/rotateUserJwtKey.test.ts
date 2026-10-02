import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

// eslint-disable-next-line import/first -- mocks must be registered first
import { prisma } from "~/server/clients/prismaClient";
// eslint-disable-next-line import/first -- mocks must be registered first
import { rotateUserJwtKey } from "../rotateUserJwtKey";

describe("rotateUserJwtKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes a fresh jwtKey for the user", async () => {
    (prisma.user.update as any).mockResolvedValue({ id: 42, jwtKey: "new" });

    await rotateUserJwtKey(42);

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const call = (prisma.user.update as any).mock.calls[0][0];
    expect(call.where).toEqual({ id: 42 });
    expect(typeof call.data.jwtKey).toBe("string");
    expect(call.data.jwtKey.length).toBeGreaterThan(10);
  });

  it("generates a different key on each rotation", async () => {
    (prisma.user.update as any).mockResolvedValue({});

    await rotateUserJwtKey(42);
    const first = (prisma.user.update as any).mock.calls[0][0].data.jwtKey;
    await rotateUserJwtKey(42);
    const second = (prisma.user.update as any).mock.calls[1][0].data.jwtKey;

    expect(first).not.toBe(second);
  });
});
