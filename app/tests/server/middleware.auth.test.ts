import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetHeader = vi.fn();
const mockGetCookie = vi.fn();
const mockSetResponseStatus = vi.fn();

vi.mock("h3", () => ({
  defineEventHandler: (handler: (_e: any) => any) => handler,
  getRequestURL: (event: { node: { req: { url: string } } }) =>
    new URL(event.node.req.url, "http://localhost"),
  getHeader: (event: any, name: string) => mockGetHeader(event, name),
  getCookie: (event: any, name: string) => mockGetCookie(event, name),
  setResponseStatus: (event: any, code: number) =>
    mockSetResponseStatus(event, code),
}));

const mockVerify = vi.fn();
vi.mock("~/server/services/JwtService", () => ({
  default: vi.fn().mockImplementation(() => ({
    verify: mockVerify,
  })),
}));

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

function createEvent(url: string, method: string) {
  return {
    node: { req: { url, method } },
    context: {} as any,
  };
}

type MockPrismaModule = {
  prisma: { user: { findUnique: ReturnType<typeof vi.fn> } };
};

describe("auth middleware", () => {
  let authHandler: (_event: any) => Promise<any>;
  let prevNodeEnv: string | undefined;
  let prevInternalToken: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    prevNodeEnv = process.env.NODE_ENV;
    prevInternalToken = process.env.INTERNAL_API_TOKEN;
    process.env.INTERNAL_API_TOKEN = "internal-secret";
    const { prisma } = (await import(
      "~/server/clients/prismaClient"
    )) as MockPrismaModule;
    prisma.user.findUnique.mockReset();
    const module = await import("~/server/middleware/auth");
    authHandler = module.default;
  });

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevInternalToken === undefined) {
      delete process.env.INTERNAL_API_TOKEN;
    } else {
      process.env.INTERNAL_API_TOKEN = prevInternalToken;
    }
  });

  it("should not run auth for non-API URLs", async () => {
    const event = createEvent("/", "GET");
    const result = await authHandler(event);
    expect(result).toBeUndefined();
    expect(mockGetHeader).not.toHaveBeenCalled();
  });

  it("should not run auth for ignored exact route POST /api/login", async () => {
    const event = createEvent("/api/login", "POST");
    const result = await authHandler(event);
    expect(result).toBeUndefined();
    expect(mockGetHeader).not.toHaveBeenCalled();
  });

  it("should not run auth for ignored regex route GET /api/_ah/liveness", async () => {
    const event = createEvent("/api/_ah/liveness", "GET");
    const result = await authHandler(event);
    expect(result).toBeUndefined();
    expect(mockGetHeader).not.toHaveBeenCalled();
  });

  it("should not run auth for ignored exact route POST /api/account-signup", async () => {
    const event = createEvent("/api/account-signup", "POST");
    const result = await authHandler(event);
    expect(result).toBeUndefined();
    expect(mockGetHeader).not.toHaveBeenCalled();
  });

  it("should not run auth for ignored exact route POST /api/logout", async () => {
    const event = createEvent("/api/logout", "POST");
    const result = await authHandler(event);
    expect(result).toBeUndefined();
    expect(mockGetHeader).not.toHaveBeenCalled();
  });

  it("should not run auth for GET /api/account-invite/validate with query string (pathname match)", async () => {
    const event = createEvent(
      "/api/account-invite/validate?token=abc123",
      "GET",
    );
    const result = await authHandler(event);
    expect(result).toBeUndefined();
    expect(mockGetHeader).not.toHaveBeenCalled();
  });

  it("should return 401 when no token (no header, no cookie)", async () => {
    const event = createEvent("/api/user", "GET");
    mockGetHeader.mockReturnValue(undefined);
    mockGetCookie.mockReturnValue(undefined);

    const result = await authHandler(event);

    expect(mockSetResponseStatus).toHaveBeenCalledWith(event, 401);
    expect(result).toEqual({ message: "Token is missing." });
  });

  it("should set context.user and continue when Bearer token is valid", async () => {
    const event = createEvent("/api/user", "GET");
    mockGetHeader.mockReturnValue("Bearer valid-token");
    mockGetCookie.mockReturnValue(undefined);
    const decoded = { userId: 1, jwtKey: "k", iat: 1, exp: 999 };
    mockVerify.mockResolvedValue(decoded);

    const result = await authHandler(event);

    expect(mockVerify).toHaveBeenCalledWith("valid-token");
    expect(event.context.user).toEqual(decoded);
    expect(result).toBeUndefined();
  });

  it("should use authToken cookie when Authorization header is missing", async () => {
    const event = createEvent("/api/lists", "GET");
    mockGetHeader.mockReturnValue(undefined);
    mockGetCookie.mockReturnValue("cookie-token");
    const decoded = { userId: 2, jwtKey: "k2", iat: 1, exp: 999 };
    mockVerify.mockResolvedValue(decoded);

    await authHandler(event);

    expect(mockVerify).toHaveBeenCalledWith("cookie-token");
    expect(event.context.user).toEqual(decoded);
  });

  it("should return 401 with error message when JwtService.verify throws Error", async () => {
    const event = createEvent("/api/user", "GET");
    mockGetHeader.mockReturnValue("Bearer bad-token");
    mockGetCookie.mockReturnValue(undefined);
    mockVerify.mockRejectedValue(new Error("Token expired"));

    const result = await authHandler(event);

    expect(mockSetResponseStatus).toHaveBeenCalledWith(event, 401);
    expect(result).toEqual({ message: "Token expired" });
  });

  it("should return 401 with Invalid token when verify throws non-Error", async () => {
    const event = createEvent("/api/user", "GET");
    mockGetHeader.mockReturnValue("Bearer bad-token");
    mockGetCookie.mockReturnValue(undefined);
    mockVerify.mockRejectedValue("string error");

    const result = await authHandler(event);

    expect(mockSetResponseStatus).toHaveBeenCalledWith(event, 401);
    expect(result).toEqual({ message: "Invalid or expired session." });
  });

  it("should skip JWT for task routes when x-internal-token matches INTERNAL_API_TOKEN", async () => {
    const event = createEvent("/api/tasks/foo", "POST");
    mockGetHeader.mockImplementation((_e: unknown, name: string) => {
      if (name === "x-internal-token") return "internal-secret";
      return undefined;
    });
    mockGetCookie.mockReturnValue(undefined);

    const result = await authHandler(event);

    expect(mockVerify).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("should require JWT when internal token length mismatches (no throw before compare)", async () => {
    const event = createEvent("/api/tasks/foo", "POST");
    mockGetHeader.mockImplementation((_e: unknown, name: string) => {
      if (name === "x-internal-token") return "short";
      return undefined;
    });
    mockGetCookie.mockReturnValue(undefined);

    const result = await authHandler(event);

    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockSetResponseStatus).toHaveBeenCalledWith(event, 401);
    expect(result).toEqual({ message: "Token is missing." });
  });

  it("should fall through to JWT when internal token mismatches", async () => {
    const event = createEvent("/api/tasks/foo", "POST");
    mockGetHeader.mockImplementation((_e: unknown, name: string) => {
      if (name === "x-internal-token") return "internal-secretXXXX";
      if (name === "authorization") return "Bearer valid-token";
      return undefined;
    });
    mockGetCookie.mockReturnValue(undefined);
    const decoded = { userId: 1, jwtKey: "k", iat: 1, exp: 999 };
    mockVerify.mockResolvedValue(decoded);
    const { prisma } = (await import(
      "~/server/clients/prismaClient"
    )) as MockPrismaModule;
    prisma.user.findUnique.mockResolvedValue({
      id: 1,
      role: "ADMIN",
      email: "u@example.com",
    });

    const result = await authHandler(event);

    expect(mockVerify).toHaveBeenCalledWith("valid-token");
    expect(result).toBeUndefined();
  });

  it("should return generic JWT message in production when verify throws", async () => {
    process.env.NODE_ENV = "production";
    const event = createEvent("/api/user", "GET");
    mockGetHeader.mockReturnValue("Bearer bad-token");
    mockGetCookie.mockReturnValue(undefined);
    mockVerify.mockRejectedValue(new Error("Token expired"));

    const result = await authHandler(event);

    expect(mockSetResponseStatus).toHaveBeenCalledWith(event, 401);
    expect(result).toEqual({ message: "Invalid or expired session." });
  });
});
