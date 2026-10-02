import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(),
}));

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

describe("recordAdminAudit", () => {
  let recordAdminAudit: (
    _event: unknown,
    _entry: {
      action: string;
      targetUserId?: number | null;
      targetAccountId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<void>;
  let getUser: any;
  let prisma: any;
  let log: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaModule = await import("~/server/clients/prismaClient");
    prisma = prismaModule.prisma;
    const getUserModule = await import("~/server/lib/getUser");
    getUser = getUserModule.getUser;
    const loggerModule = await import("~/server/logger");
    log = loggerModule.log;
    const module = await import("~/server/lib/recordAdminAudit");
    recordAdminAudit = module.recordAdminAudit;
    getUser.mockReturnValue({ userId: 123 });
  });

  it("writes an audit row with the actor id and entry fields", async () => {
    await recordAdminAudit({ context: {} }, {
      action: "user.update",
      targetUserId: 5,
      targetAccountId: "acc-1",
      metadata: { fields: ["firstName"] },
    });

    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminUserId: 123,
        action: "user.update",
        targetUserId: 5,
        targetAccountId: "acc-1",
        metadata: { fields: ["firstName"] },
      },
    });
  });

  it("defaults missing targets to null and metadata to undefined", async () => {
    await recordAdminAudit({ context: {} }, { action: "user.password_reset" });

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminUserId: 123,
        action: "user.password_reset",
        targetUserId: null,
        targetAccountId: null,
        metadata: undefined,
      },
    });
  });

  it("keeps explicitly empty metadata", async () => {
    await recordAdminAudit({ context: {} }, { action: "user.update", metadata: {} });

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: {} }),
    });
  });

  it("swallows prisma failures and logs instead of throwing", async () => {
    prisma.adminAuditLog.create.mockRejectedValue(new Error("db down"));

    await expect(
      recordAdminAudit({ context: {} }, { action: "user.update" }),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        message: "Failed to record admin audit",
        data: { error: "db down" },
      }),
    );
  });

  it("swallows errors thrown while resolving the actor", async () => {
    getUser.mockImplementation(() => {
      throw new Error("HTTP 401: User not found in context");
    });

    await expect(
      recordAdminAudit({ context: {} }, { action: "user.update" }),
    ).resolves.toBeUndefined();

    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        message: "Failed to record admin audit",
      }),
    );
  });
});
