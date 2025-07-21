import { z } from "zod";
import { plaidRootSchema } from "./plaid";

export const publicProfileSchema = z.object({
  id: z.number(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string(),
  countryId: z.number().optional(),
  timezoneOffset: z.number().optional(),
  isDaylightSaving: z.boolean().optional(),
  settings: z
    .object({
      speakeasy: z
        .object({
          isEnabled: z.boolean().default(false),
          isVerified: z.boolean().default(false),
        })
        .default({ isEnabled: false, isVerified: false }),
      plaid: z
        .object({
          isEnabled: z.boolean().default(false),
          public_token: z.string().optional(),
        })
        .default({ isEnabled: false }),
    })
    .default({
      speakeasy: { isEnabled: false },
      plaid: { isEnabled: false },
    }),
});

export const privateUserSchema = publicProfileSchema.merge(
  z.object({
    settings: z.object({
      speakeasy: z
        .object({
          isEnabled: z.boolean().default(false),
          isVerified: z.boolean().default(false),
          base32secret: z.string().optional(),
          backupCodes: z.array(z.string()).optional(),
        })
        .default({ isEnabled: false, isVerified: false }),
      plaid: plaidRootSchema,
    }),
  })
);

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tokenChallenge: z.string().optional(),
});

export const passwordSchema = z
  .object({
    newPassword: z
      .string()
      .min(6, "Password must be at least 6 characters long"),
    confirmPassword: z
      .string()
      .min(6, "Confirm password must be at least 6 characters long"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const registerSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters long"),
    confirmPassword: z
      .string()
      .min(6, "Confirm password must be at least 6 characters long"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const accountRegisterSchema = z.object({
  id: z.number(),
  accountId: z.string().min(1),
  subAccountRegisterId: z.coerce
    .number()
    .min(1)
    .nullable()
    .transform((a) => (a ? a : undefined))
    .optional(),
  typeId: z.coerce.number().min(1).default(0),
  budgetId: z.coerce.number().min(1).default(0),
  name: z.string().min(3),
  balance: z.coerce.number().default(0),
  latestBalance: z.coerce.number().default(0),
  minPayment: z.coerce.number().nullable().default(null),
  statementAt: z.coerce.date().default(new Date()),
  apr1: z.coerce.number().nullable().default(null),
  apr1StartAt: z.coerce.date().nullable().default(null),
  apr2: z.coerce.number().nullable().default(null),
  apr2StartAt: z.coerce.date().nullable().default(null),
  apr3: z.coerce.number().nullable().default(null),
  apr3StartAt: z.coerce.date().nullable().default(null),
  targetAccountRegisterId: z.coerce.number().nullable().default(null),
  loanStartAt: z.coerce.date().nullable().default(null),
  loanPaymentsPerYear: z.coerce.number().nullable().default(null),
  loanTotalYears: z.coerce.number().nullable().default(null),
  loanOriginalAmount: z.coerce.number().nullable().default(null),
  sortOrder: z.number().default(0),
  savingsGoalSortOrder: z.number().default(0),
  accountSavingsGoal: z.coerce.number().nullable().default(null),
  minAccountBalance: z.coerce.number().default(0),
  allowExtraPayment: z.boolean().default(false),
  isArchived: z.boolean().default(false),
});

export const reoccurrenceSchema = z.object({
  id: z.number().default(0),
  accountId: z.string().min(1),
  accountRegisterId: z.coerce.number().min(1).default(0),
  intervalId: z.coerce.number().min(1).default(0),
  transferAccountRegisterId: z.coerce.number().optional(),
  intervalCount: z.coerce.number().min(1).default(0),
  adjustBeforeIfOnWeekend: z.boolean().default(false),
  endAt: z.union([
    z.string(),
    z.date().transform((d) => d.toISOString()),
    z.undefined().transform(() => undefined),
    z.null().transform(() => undefined),
  ]),
  lastAt: z.union([z.string(), z.date().transform((d) => d.toISOString())]),
  amount: z.coerce.number(),
  description: z
    .string()
    .min(3, "Description must be at least 3 characters long"),
});

export const intervalSchema = z.object({
  id: z.number(),
  type: z.string(),
  name: z.string(),
});

export const accountTypeSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  type: z.string(),
});

export const recalculateSchema = z.object({
  accountRegisterId: z.coerce.number().optional(),
  accountId: z.string().optional(),
});

export const budgetSchema = z.object({
  id: z.number(),
  accountId: z.string(),
  name: z.string(),
  isArchived: z.boolean(),
  isDefault: z.boolean(),
  userId: z.number().nullable(),
});

export const accountSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const registerEntrySchema = z.object({
  id: z.string().optional(),
  accountRegisterId: z.coerce.number().min(1),
  sourceAccountRegisterId: z.coerce.number().optional(),
  description: z
    .string()
    .min(3, "Description must be at least 3 characters long"),
  reoccurrenceId: z.coerce.number().nullable().optional(),
  amount: z.coerce.number(),
  balance: z.coerce.number(),
  isProjected: z.boolean().default(false),
  isReconciled: z.boolean().default(false),
  isCleared: z.boolean().default(false),
  isBalanceEntry: z.boolean().default(false),
  isPending: z.boolean().default(false),
  plaidId: z.string().nullable().optional(),
  plaidJson: z.any().nullable().optional(),
  createdAt: z.coerce.date().default(new Date()),
});

export const passwordAndCodeSchema = z
  .object({
    resetCode: z.string(),
    newPassword: z
      .string()
      .min(6, "Password must be at least 6 characters long"),
    confirmPassword: z
      .string()
      .min(6, "Confirm password must be at least 6 characters long"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
