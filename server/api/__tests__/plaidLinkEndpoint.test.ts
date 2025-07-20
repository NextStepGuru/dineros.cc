import { describe, it, expect, beforeEach, vi } from "vitest";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  // Make defineEventHandler available globally before any imports
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
});

// Mock H3/Nuxt utilities before any imports
vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  readBody: vi.fn(),
  createError: vi.fn(),
}));

// Mock dependencies
vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(),
}));

vi.mock("~/server/lib/getPlaidClient", () => ({
  configuration: {
    basePath: "https://sandbox.plaid.com",
    apiKey: {
      clientId: "test-client-id",
      secret: "test-secret",
    },
  },
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("plaid", () => ({
  PlaidApi: vi.fn(),
  Products: {
    Transactions: "transactions",
  },
  CountryCode: {
    Us: "US",
  },
}));

describe("Plaid Link API Endpoint", () => {
  let plaidLinkHandler: any;
  let mockPlaidClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock PlaidApi constructor
    mockPlaidClient = {
      linkTokenCreate: vi.fn(),
    };
    const { PlaidApi } = await import("plaid");
    (PlaidApi as any).mockImplementation(() => mockPlaidClient);

    // Import the handler after mocking dependencies
    const module = await import("../plaid-link");
    plaidLinkHandler = module.default;
  });

  describe("GET /api/plaid-link", () => {
    it("should successfully create Plaid Link token", async () => {
      const mockEvent = {};
      const mockUser = { userId: 123 };
      const mockLinkTokenResponse = {
        data: {
          link_token: "link-sandbox-token",
          expiration: "2024-12-31T23:59:59Z",
          request_id: "request-123",
        },
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { PlaidApi } = await import("plaid");
      const { Products, CountryCode } = await import("plaid");

      (getUser as any).mockReturnValue(mockUser);
      mockPlaidClient.linkTokenCreate.mockResolvedValue(mockLinkTokenResponse);

      const result = await plaidLinkHandler(mockEvent);

      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(PlaidApi).toHaveBeenCalled();
      expect(mockPlaidClient.linkTokenCreate).toHaveBeenCalledWith({
        user: {
          client_user_id: "123",
        },
        client_name: "Dineros.cc",
        products: [Products.Transactions],
        language: "en",
        country_codes: [CountryCode.Us],
      });
      expect(result).toEqual(mockLinkTokenResponse.data);
    });

    it("should handle Plaid API errors", async () => {
      const mockEvent = {};
      const mockUser = { userId: 123 };
      const mockError = new Error("Plaid API error");

      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getUser as any).mockReturnValue(mockUser);
      mockPlaidClient.linkTokenCreate.mockRejectedValue(mockError);
      (handleApiError as any).mockImplementation((error: any) => {
        throw error;
      });

      await expect(plaidLinkHandler(mockEvent)).rejects.toThrow(
        "Plaid API error"
      );

      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(handleApiError).toHaveBeenCalledWith(mockError);
    });

    it("should handle authentication errors", async () => {
      const mockEvent = {};
      const authError = new Error("Unauthorized");

      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getUser as any).mockImplementation(() => {
        throw authError;
      });
      (handleApiError as any).mockImplementation((error: any) => {
        throw error;
      });

      await expect(plaidLinkHandler(mockEvent)).rejects.toThrow("Unauthorized");

      expect(getUser).toHaveBeenCalledWith(mockEvent);
    });

    it("should use correct Plaid configuration", async () => {
      const mockEvent = {};
      const mockUser = { userId: 456 };
      const mockLinkTokenResponse = {
        data: {
          link_token: "link-sandbox-token",
          expiration: "2024-12-31T23:59:59Z",
          request_id: "request-456",
        },
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { configuration } = await import("~/server/lib/getPlaidClient");

      (getUser as any).mockReturnValue(mockUser);
      mockPlaidClient.linkTokenCreate.mockResolvedValue(mockLinkTokenResponse);

      await plaidLinkHandler(mockEvent);

      expect(mockPlaidClient.linkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          user: {
            client_user_id: "456",
          },
          client_name: "Dineros.cc",
          products: ["transactions"],
          language: "en",
          country_codes: ["US"],
        })
      );
    });
  });
});
