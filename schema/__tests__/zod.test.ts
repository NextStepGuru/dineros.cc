import { describe, it, expect } from "vitest";
import {
  loginSchema,
  registerSchema,
  passwordSchema,
  passwordAndCodeSchema,
  accountRegisterSchema,
  reoccurrenceSchema,
  registerEntrySchema,
  publicProfileSchema,
  recalculateSchema,
  intervalSchema,
  accountTypeSchema,
  budgetSchema,
  createBudgetSchema,
  renameBudgetSchema,
  accountSchema,
} from "../zod";

describe("schema/zod", () => {
  describe("loginSchema", () => {
    it("accepts valid email and password", () => {
      const result = loginSchema.parse({
        email: "user@example.com",
        password: "secret123",
      });
      expect(result.email).toBe("user@example.com");
      expect(result.password).toBe("secret123");
    });

    it("accepts optional tokenChallenge", () => {
      const result = loginSchema.parse({
        email: "a@b.co",
        password: "p",
        tokenChallenge: "challenge-123",
      });
      expect(result.tokenChallenge).toBe("challenge-123");
    });

    it("rejects invalid email", () => {
      expect(() =>
        loginSchema.parse({ email: "not-an-email", password: "x" })
      ).toThrow();
    });

    it("rejects empty password", () => {
      expect(() =>
        loginSchema.parse({ email: "a@b.co", password: "" })
      ).toThrow();
    });
  });

  describe("registerSchema", () => {
    it("accepts valid signup payload", () => {
      const result = registerSchema.parse({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        password: "password6",
        confirmPassword: "password6",
      });
      expect(result.firstName).toBe("Jane");
      expect(result.email).toBe("jane@example.com");
    });

    it("rejects when passwords do not match", () => {
      expect(() =>
        registerSchema.parse({
          firstName: "J",
          lastName: "D",
          email: "j@d.co",
          password: "password6",
          confirmPassword: "other6chars",
        })
      ).toThrow(/Passwords do not match|confirmPassword/);
    });

    it("rejects short password", () => {
      expect(() =>
        registerSchema.parse({
          firstName: "J",
          lastName: "D",
          email: "j@d.co",
          password: "short",
          confirmPassword: "short",
        })
      ).toThrow();
    });

    it("rejects empty firstName", () => {
      expect(() =>
        registerSchema.parse({
          firstName: "",
          lastName: "D",
          email: "j@d.co",
          password: "password6",
          confirmPassword: "password6",
        })
      ).toThrow();
    });
  });

  describe("passwordSchema", () => {
    it("accepts matching new and confirm password", () => {
      const result = passwordSchema.parse({
        newPassword: "newpass6",
        confirmPassword: "newpass6",
      });
      expect(result.newPassword).toBe("newpass6");
    });

    it("rejects when passwords do not match", () => {
      expect(() =>
        passwordSchema.parse({
          newPassword: "newpass6",
          confirmPassword: "different6",
        })
      ).toThrow(/Passwords do not match|confirmPassword/);
    });

    it("rejects short newPassword", () => {
      expect(() =>
        passwordSchema.parse({
          newPassword: "short",
          confirmPassword: "short",
        })
      ).toThrow();
    });
  });

  describe("passwordAndCodeSchema", () => {
    it("accepts valid reset payload", () => {
      const result = passwordAndCodeSchema.parse({
        resetCode: "code123",
        newPassword: "newpass6",
        confirmPassword: "newpass6",
      });
      expect(result.resetCode).toBe("code123");
      expect(result.newPassword).toBe("newpass6");
    });

    it("rejects when passwords do not match", () => {
      expect(() =>
        passwordAndCodeSchema.parse({
          resetCode: "c",
          newPassword: "newpass6",
          confirmPassword: "other6ch",
        })
      ).toThrow();
    });
  });

  describe("accountRegisterSchema", () => {
    it("accepts minimal valid account register", () => {
      const result = accountRegisterSchema.parse({
        id: 1,
        accountId: "acc-1",
        name: "Checking Account",
        balance: 0,
        latestBalance: 0,
      });
      expect(result.id).toBe(1);
      expect(result.accountId).toBe("acc-1");
      expect(result.name).toBe("Checking Account");
      expect(result.sortOrder).toBe(0);
    });

    it("coerces number fields that use coerce", () => {
      const result = accountRegisterSchema.parse({
        id: 1,
        accountId: "a",
        name: "Nam",
        balance: "100",
        latestBalance: "200",
      });
      expect(result.balance).toBe(100);
      expect(result.latestBalance).toBe(200);
    });

    it("rejects name shorter than 3 characters", () => {
      expect(() =>
        accountRegisterSchema.parse({
          id: 1,
          accountId: "a",
          name: "ab",
        })
      ).toThrow();
    });
  });

  describe("reoccurrenceSchema", () => {
    it("accepts valid reoccurrence", () => {
      const result = reoccurrenceSchema.parse({
        accountId: "acc-1",
        accountRegisterId: 1,
        intervalId: 1,
        description: "Monthly salary",
        amount: 5000,
        lastAt: "2024-01-01",
      });
      expect(result.accountId).toBe("acc-1");
      expect(result.description).toBe("Monthly salary");
      expect(result.amount).toBe(5000);
    });

    it("rejects description shorter than 3 characters", () => {
      expect(() =>
        reoccurrenceSchema.parse({
          accountId: "a",
          accountRegisterId: 1,
          intervalId: 1,
          description: "ab",
          amount: 0,
          lastAt: "2024-01-01",
        })
      ).toThrow();
    });

    it("coerces amount from string", () => {
      const result = reoccurrenceSchema.parse({
        accountId: "a",
        accountRegisterId: 1,
        intervalId: 1,
        description: "Desc",
        amount: "100",
        lastAt: "2024-01-01",
      });
      expect(result.amount).toBe(100);
    });
  });

  describe("registerEntrySchema", () => {
    it("accepts valid register entry", () => {
      const result = registerEntrySchema.parse({
        accountRegisterId: 1,
        description: "Groceries",
        amount: -50,
        balance: 1000,
      });
      expect(result.accountRegisterId).toBe(1);
      expect(result.description).toBe("Groceries");
      expect(result.amount).toBe(-50);
      expect(result.isProjected).toBe(false);
    });

    it("rejects description shorter than 3 characters", () => {
      expect(() =>
        registerEntrySchema.parse({
          accountRegisterId: 1,
          description: "ab",
          amount: 0,
          balance: 0,
        })
      ).toThrow();
    });

    it("rejects accountRegisterId less than 1", () => {
      expect(() =>
        registerEntrySchema.parse({
          accountRegisterId: 0,
          description: "Desc",
          amount: 0,
          balance: 0,
        })
      ).toThrow();
    });
  });

  describe("publicProfileSchema", () => {
    it("accepts valid profile with required fields", () => {
      const result = publicProfileSchema.parse({
        id: 1,
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        password: "hashed",
      });
      expect(result.firstName).toBe("John");
      expect(result.email).toBe("john@example.com");
      expect(result.settings).toBeDefined();
      expect(result.settings.speakeasy.isEnabled).toBe(false);
    });

    it("rejects invalid email", () => {
      expect(() =>
        publicProfileSchema.parse({
          id: 1,
          firstName: "J",
          lastName: "D",
          email: "invalid",
          password: "p",
        })
      ).toThrow();
    });
  });

  describe("recalculateSchema", () => {
    it("accepts empty object", () => {
      const result = recalculateSchema.parse({});
      expect(result).toEqual({});
    });

    it("accepts accountRegisterId", () => {
      const result = recalculateSchema.parse({
        accountRegisterId: 5,
      });
      expect(result.accountRegisterId).toBe(5);
    });

    it("accepts accountId", () => {
      const result = recalculateSchema.parse({
        accountId: "acc-123",
      });
      expect(result.accountId).toBe("acc-123");
    });
  });

  describe("intervalSchema", () => {
    it("accepts valid interval", () => {
      const result = intervalSchema.parse({
        id: 1,
        type: "month",
        name: "Monthly",
      });
      expect(result.id).toBe(1);
      expect(result.name).toBe("Monthly");
    });
  });

  describe("accountTypeSchema", () => {
    it("accepts valid account type", () => {
      const result = accountTypeSchema.parse({
        id: 1,
        name: "Checking",
        type: "depository",
      });
      expect(result.id).toBe(1);
    });
  });

  describe("budgetSchema", () => {
    it("accepts valid budget", () => {
      const result = budgetSchema.parse({
        id: 1,
        accountId: "acc-1",
        name: "Default",
        isArchived: false,
        isDefault: true,
        userId: 123,
      });
      expect(result.userId).toBe(123);
    });
  });

  describe("createBudgetSchema", () => {
    it("accepts valid name", () => {
      const result = createBudgetSchema.parse({ name: "Vacation" });
      expect(result.name).toBe("Vacation");
    });
    it("rejects empty string", () => {
      expect(() => createBudgetSchema.parse({ name: "" })).toThrow();
    });
    it("rejects missing name", () => {
      expect(() => createBudgetSchema.parse({})).toThrow();
    });
    it("rejects name longer than 255", () => {
      expect(() =>
        createBudgetSchema.parse({ name: "a".repeat(256) })
      ).toThrow();
    });
  });

  describe("renameBudgetSchema", () => {
    it("accepts valid name", () => {
      const result = renameBudgetSchema.parse({ name: "Vacation" });
      expect(result.name).toBe("Vacation");
    });
    it("rejects empty string", () => {
      expect(() => renameBudgetSchema.parse({ name: "" })).toThrow();
    });
    it("rejects missing name", () => {
      expect(() => renameBudgetSchema.parse({})).toThrow();
    });
    it("rejects name longer than 255", () => {
      expect(() =>
        renameBudgetSchema.parse({ name: "a".repeat(256) })
      ).toThrow();
    });
  });

  describe("accountSchema", () => {
    it("accepts valid account", () => {
      const result = accountSchema.parse({
        id: 1,
        name: "My Account",
      });
      expect(result.name).toBe("My Account");
    });
  });
});
