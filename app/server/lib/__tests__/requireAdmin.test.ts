import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server dependencies (h3 is already mocked by vitest.setup.ts:
// createError throws an Error carrying .statusCode/.statusMessage)
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(),
}));

describe("requireAdmin", () => {
  let requireAdmin: (_event: unknown) => Promise<void>;
  let getUser: any;
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaModule = await import("~/server/clients/prismaClient");
    prisma = prismaModule.prisma;
    const getUserModule = await import("~/server/lib/getUser");
    getUser = getUserModule.getUser;
    const module = await import("~/server/lib/requireAdmin");
    requireAdmin = module.requireAdmin;
  });

  it("allows users with the ADMIN role", async () => {
    getUser.mockReturnValue({ userId: 1 });
    prisma.user.findUnique.mockResolvedValue({
      id: 1,
      role: "ADMIN",
      email: "someone@example.com",
    });

    await expect(requireAdmin({ context: {} })).resolves.toBeUndefined();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it("allows the configured admin email even without the ADMIN role", async () => {
    getUser.mockReturnValue({ userId: 2 });
    // ADMIN_EMAIL falls back to "admin@dineros.cc" in tests (env is not set)
    prisma.user.findUnique.mockResolvedValue({
      id: 2,
      role: null,
      email: "admin@dineros.cc",
    });

    await expect(requireAdmin({ context: {} })).resolves.toBeUndefined();
  });

  it("is case-insensitive on the admin email", async () => {
    getUser.mockReturnValue({ userId: 3 });
    prisma.user.findUnique.mockResolvedValue({
      id: 3,
      role: "USER",
      email: "  Admin@Dineros.CC ",
    });

    await expect(requireAdmin({ context: {} })).resolves.toBeUndefined();
  });

  it("throws 403 for non-admin users", async () => {
    getUser.mockReturnValue({ userId: 4 });
    prisma.user.findUnique.mockResolvedValue({
      id: 4,
      role: "USER",
      email: "user@example.com",
    });

    await expect(requireAdmin({ context: {} })).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: "Forbidden",
    });
  });

  it("throws 403 when the user does not exist", async () => {
    getUser.mockReturnValue({ userId: 999 });
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(requireAdmin({ context: {} })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 999 },
    });
  });

  it("treats a non-string role as no role", async () => {
    getUser.mockReturnValue({ userId: 5 });
    prisma.user.findUnique.mockResolvedValue({
      id: 5,
      role: "admin", // lowercase is not the stored ADMIN role
      email: "user@example.com",
    });

    await expect(requireAdmin({ context: {} })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("propagates auth errors thrown while resolving the user", async () => {
    const unauthorized = Object.assign(
      new Error("HTTP 401: User not found in context"),
      { statusCode: 401, statusMessage: "User not found in context" },
    );
    getUser.mockImplementation(() => {
      throw unauthorized;
    });

    await expect(requireAdmin({ context: {} })).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
