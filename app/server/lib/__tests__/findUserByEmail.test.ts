import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "~/server/clients/prismaClient";
import { findUserByEmail } from "../findUserByEmail";

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

const USER = { id: 1, email: "user@example.com" } as any;

function sha512(value: string): string {
  return createHash("sha512").update(value, "utf8").digest("hex");
}

describe("findUserByEmail", () => {
  beforeEach(() => {
    // reset (not clear): leftover mockResolvedValueOnce queues must not bleed across tests
    vi.resetAllMocks();
  });

  it("finds the user by exact email first", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce(USER);

    await expect(findUserByEmail("user@example.com")).resolves.toBe(USER);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to findFirst when the exact unique lookup misses", async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce(null);
    (prisma.user.findFirst as any).mockResolvedValueOnce(USER);

    await expect(findUserByEmail("user@example.com")).resolves.toBe(USER);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
  });

  it("falls back to the sha512 email hash of the trimmed email", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(USER);

    await expect(findUserByEmail("user@example.com")).resolves.toBe(USER);

    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(2, {
      where: { emailHash: sha512("user@example.com") },
    });
  });

  it("tries the lowercased email and its hash when the input has uppercase", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce(null) // exact email unique
      .mockResolvedValueOnce(null) // emailHash (trimmed)
      .mockResolvedValueOnce(null) // lowercase email unique
      .mockResolvedValueOnce(USER); // lowercase emailHash unique

    await expect(findUserByEmail("User@Example.com")).resolves.toBe(USER);

    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(3, {
      where: { email: "user@example.com" },
    });
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(4, {
      where: { emailHash: sha512("user@example.com") },
    });
  });

  it("does not retry lowercase variants when the input is already lowercase", async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.findFirst as any).mockResolvedValue(null);

    await expect(findUserByEmail("user@example.com")).resolves.toBeNull();

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it("returns null after exhausting all fallbacks", async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.findFirst as any).mockResolvedValue(null);

    await expect(findUserByEmail("User@Example.com")).resolves.toBeNull();
  });
});
