import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetHeader = vi.fn();
const mockGetCookie = vi.fn();
const mockSetResponseStatus = vi.fn();

vi.mock("h3", () => ({
  defineEventHandler: (handler: (e: any) => any) => handler,
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

describe("auth middleware", () => {
  let authHandler: (event: any) => Promise<any>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("~/server/middleware/auth");
    authHandler = module.default;
  });

  function createEvent(url: string, method: string) {
    const event = {
      node: { req: { url, method } },
      context: {} as any,
    };
    return event;
  }

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
    expect(result).toEqual({ message: "Invalid token." });
  });
});
