import { describe, it, expect } from "vitest";
import {
  processLoginResponse,
  validateLoginCredentials,
  getPostLoginRedirect,
  formatLoginError,
  type LoginResponse,
  type LoginCredentials,
} from "../auth";

describe("Authentication Utilities", () => {
  describe("processLoginResponse", () => {
    it("should handle successful login with token and user", () => {
      const response: LoginResponse = {
        token: "jwt-token-123",
        user: { id: 1, email: "test@example.com" },
      };

      const result = processLoginResponse(response);

      expect(result).toEqual({
        success: true,
        requiresTwoFactor: false,
        token: "jwt-token-123",
        user: { id: 1, email: "test@example.com" },
      });
    });

    it("should handle successful login with token only", () => {
      const response: LoginResponse = {
        token: "jwt-token-123",
      };

      const result = processLoginResponse(response);

      expect(result).toEqual({
        success: true,
        requiresTwoFactor: false,
        token: "jwt-token-123",
        user: undefined,
      });
    });

    it("should handle 2FA challenge required", () => {
      const response: LoginResponse = {
        twoFactorChallengeRequired: true,
      };

      const result = processLoginResponse(response);

      expect(result).toEqual({
        success: false,
        requiresTwoFactor: true,
        mfaMethods: [],
      });
    });

    it("should handle invalid response format", () => {
      const response: LoginResponse = {
        // No token or twoFactorChallengeRequired
      };

      const result = processLoginResponse(response);

      expect(result).toEqual({
        success: false,
        requiresTwoFactor: false,
        errorMessage: "Invalid login credentials.",
      });
    });
  });

  describe("validateLoginCredentials", () => {
    it("should validate correct email and password", () => {
      const credentials: LoginCredentials = {
        email: "test@example.com",
        password: "password123",
      };

      const result = validateLoginCredentials(credentials);

      expect(result).toBeNull();
    });

    it("should validate correct email and 2FA token", () => {
      const credentials: LoginCredentials = {
        email: "test@example.com",
        password: "",
        tokenChallenge: "123456",
      };

      const result = validateLoginCredentials(credentials);

      expect(result).toBeNull();
    });

    it("should reject missing email", () => {
      const credentials: LoginCredentials = {
        email: "",
        password: "password123",
      };

      const result = validateLoginCredentials(credentials);

      expect(result).toBe("Email is required");
    });

    it("should reject missing password and token", () => {
      const credentials: LoginCredentials = {
        email: "test@example.com",
        password: "",
      };

      const result = validateLoginCredentials(credentials);

      expect(result).toBe("Password is required");
    });

    it("should reject invalid email format", () => {
      const credentials: LoginCredentials = {
        email: "invalid-email",
        password: "password123",
      };

      const result = validateLoginCredentials(credentials);

      expect(result).toBe("Please enter a valid email address");
    });
  });

  describe("getPostLoginRedirect", () => {
    it("should redirect to first account register when available", () => {
      const accountRegisters = [
        { id: "account-1", name: "Checking" },
        { id: "account-2", name: "Savings" },
      ];

      const result = getPostLoginRedirect(accountRegisters);

      expect(result).toBe("/register/account-1");
    });

    it("should redirect to account-registers onboarding when no accounts", () => {
      const accountRegisters: any[] = [];

      const result = getPostLoginRedirect(accountRegisters);

      expect(result).toBe("/account-registers?onboarding=1");
    });

    it("should redirect to reconciliation hub when workflow is reconciliation", () => {
      const accountRegisters = [{ id: 1, name: "Checking", sortOrder: 0 }];

      const result = getPostLoginRedirect(accountRegisters, "reconciliation");

      expect(result).toBe("/reconciliation");
    });
  });

  describe("formatLoginError", () => {
    it("should format error with data.errors array", () => {
      const error = {
        data: {
          errors: ["Invalid email", "Password too short"],
        },
      };

      const result = formatLoginError(error);

      expect(result).toBe("Invalid email, Password too short");
    });

    it("should format error with data.errors string", () => {
      const error = {
        data: {
          errors: "Invalid credentials",
        },
      };

      const result = formatLoginError(error);

      expect(result).toBe("Invalid credentials");
    });

    it("should format error with message", () => {
      const error = {
        message: "Network error",
      };

      const result = formatLoginError(error);

      expect(result).toBe("Network error");
    });

    it("should provide default error message", () => {
      const error = {
        someOtherField: "value",
      };

      const result = formatLoginError(error);

      expect(result).toBe("An error occurred during login.");
    });

    it("should handle null/undefined error", () => {
      const result1 = formatLoginError(null);
      const result2 = formatLoginError(undefined);

      expect(result1).toBe("An error occurred during login.");
      expect(result2).toBe("An error occurred during login.");
    });
  });
});
