import { z } from "zod";
import { plaidRootSchema } from "./plaid";

const mfaPasskeyPrivateSchema = z.object({
  id: z.string().min(1),
  publicKey: z.string().min(1),
  counter: z.number().int().nonnegative().default(0),
  transports: z.array(z.string()).optional(),
  name: z.string().optional(),
  createdAt: z.string().optional(),
});

const mfaPasskeyPublicSchema = z.object({
  id: z.string().min(1),
  transports: z.array(z.string()).optional(),
  name: z.string().optional(),
  createdAt: z.string().optional(),
});

const mfaTotpPrivateSchema = z.object({
  isEnabled: z.boolean().default(false),
  isVerified: z.boolean().default(false),
  base32secret: z.string().optional(),
  backupCodes: z.array(z.string()).optional(),
});

const mfaTotpPublicSchema = z.object({
  isEnabled: z.boolean().default(false),
  isVerified: z.boolean().default(false),
});

const mfaEmailOtpSchema = z.object({
  isEnabled: z.boolean().default(false),
  isVerified: z.boolean().default(false),
});

const mfaPrivateSchema = z.object({
  totp: mfaTotpPrivateSchema.default({ isEnabled: false, isVerified: false }),
  passkeys: z.array(mfaPasskeyPrivateSchema).default([]),
  emailOtp: mfaEmailOtpSchema.default({ isEnabled: false, isVerified: false }),
});

const mfaPublicSchema = z.object({
  totp: mfaTotpPublicSchema.default({ isEnabled: false, isVerified: false }),
  passkeys: z.array(mfaPasskeyPublicSchema).default([]),
  emailOtp: mfaEmailOtpSchema.default({ isEnabled: false, isVerified: false }),
});

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSettings(value: unknown, includePrivateMfaFields: boolean) {
  const settings = isRecord(value) ? value : {};
  const legacySpeakeasy = isRecord(settings.speakeasy) ? settings.speakeasy : {};
  const mfa = isRecord(settings.mfa) ? settings.mfa : {};
  const mfaTotp = isRecord(mfa.totp) ? mfa.totp : {};
  const mfaEmailOtp = isRecord(mfa.emailOtp) ? mfa.emailOtp : {};

  const fallbackTotp = {
    isEnabled: Boolean(legacySpeakeasy.isEnabled),
    isVerified: Boolean(legacySpeakeasy.isVerified),
    ...(typeof legacySpeakeasy.base32secret === "string"
      ? { base32secret: legacySpeakeasy.base32secret }
      : {}),
    ...(Array.isArray(legacySpeakeasy.backupCodes)
      ? { backupCodes: legacySpeakeasy.backupCodes.filter((c) => typeof c === "string") }
      : {}),
  };

  const normalizedTotp = {
    ...fallbackTotp,
    ...mfaTotp,
  };

  const passkeysSource = Array.isArray(mfa.passkeys) ? mfa.passkeys : [];
  const normalizedPasskeys = passkeysSource
    .filter((passkey): passkey is AnyRecord => isRecord(passkey))
    .map((passkey) => {
      const normalized = {
        id: String(passkey.id || ""),
        ...(Array.isArray(passkey.transports)
          ? {
              transports: passkey.transports
                .filter((transport) => typeof transport === "string")
                .map((transport) => String(transport)),
            }
          : {}),
        ...(typeof passkey.name === "string" ? { name: passkey.name } : {}),
        ...(typeof passkey.createdAt === "string"
          ? { createdAt: passkey.createdAt }
          : {}),
      };

      if (!includePrivateMfaFields) {
        return normalized;
      }

      return {
        ...normalized,
        ...(typeof passkey.publicKey === "string"
          ? { publicKey: passkey.publicKey }
          : {}),
        ...(typeof passkey.counter === "number" ? { counter: passkey.counter } : {}),
      };
    })
    .filter((passkey) => passkey.id);

  const normalizedEmailOtp = {
    isEnabled: Boolean(mfaEmailOtp.isEnabled),
    isVerified: Boolean(mfaEmailOtp.isVerified),
  };

  return {
    ...settings,
    speakeasy: {
      isEnabled: Boolean(normalizedTotp.isEnabled),
      isVerified: Boolean(normalizedTotp.isVerified),
      ...(typeof normalizedTotp.base32secret === "string"
        ? { base32secret: normalizedTotp.base32secret }
        : {}),
      ...(Array.isArray(normalizedTotp.backupCodes)
        ? { backupCodes: normalizedTotp.backupCodes.filter((c) => typeof c === "string") }
        : {}),
    },
    mfa: {
      totp: normalizedTotp,
      passkeys: normalizedPasskeys,
      emailOtp: normalizedEmailOtp,
    },
  };
}

const publicUserSettingsSchema = z.preprocess(
  (value) => normalizeSettings(value, false),
  z
    .object({
      speakeasy: z
        .object({
          isEnabled: z.boolean().default(false),
          isVerified: z.boolean().default(false),
        })
        .default({ isEnabled: false, isVerified: false }),
      mfa: mfaPublicSchema.default({
        totp: { isEnabled: false, isVerified: false },
        passkeys: [],
        emailOtp: { isEnabled: false, isVerified: false },
      }),
      plaid: z
        .object({
          isEnabled: z.boolean().default(false),
          public_token: z.string().optional(),
        })
        .default({ isEnabled: false }),
    })
    .default({
      speakeasy: { isEnabled: false, isVerified: false },
      mfa: {
        totp: { isEnabled: false, isVerified: false },
        passkeys: [],
        emailOtp: { isEnabled: false, isVerified: false },
      },
      plaid: { isEnabled: false },
    })
);

const privateUserSettingsSchema = z.preprocess(
  (value) => normalizeSettings(value, true),
  z.object({
    speakeasy: z
      .object({
        isEnabled: z.boolean().default(false),
        isVerified: z.boolean().default(false),
        base32secret: z.string().optional(),
        backupCodes: z.array(z.string()).optional(),
      })
      .default({ isEnabled: false, isVerified: false }),
    mfa: mfaPrivateSchema.default({
      totp: { isEnabled: false, isVerified: false },
      passkeys: [],
      emailOtp: { isEnabled: false, isVerified: false },
    }),
    plaid: plaidRootSchema,
  })
);

export const publicProfileSchema = z.object({
  id: z.number(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string(),
  countryId: z.number().nullable().optional(),
  timezoneOffset: z.number().nullable().optional(),
  isDaylightSaving: z.boolean().nullable().optional(),
  settings: publicUserSettingsSchema,
});

export const privateUserSchema = publicProfileSchema.merge(
  z.object({
    settings: privateUserSettingsSchema,
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
  statementAt: z.coerce.date().default(() => new Date()),
  // Must reference interval.id (1+); 0/null from forms would violate FK — default matches Prisma @default(3)
  statementIntervalId: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return 3;
      const n = typeof val === "number" ? val : Number(val);
      if (!Number.isFinite(n) || n < 1) return 3;
      return n;
    },
    z.number().int().min(1),
  ),
  apr1: z.coerce.number().nullable().default(null),
  apr1StartAt: z.coerce.date().nullable().default(null),
  apr2: z.coerce.number().nullable().default(null),
  apr2StartAt: z.coerce.date().nullable().default(null),
  apr3: z.coerce.number().nullable().default(null),
  apr3StartAt: z.coerce.date().nullable().default(null),
  targetAccountRegisterId: z.coerce.number().nullable().default(null),
  collateralAssetRegisterId: z.coerce.number().nullable().default(null),
  loanStartAt: z.coerce.date().nullable().default(null),
  loanPaymentsPerYear: z.coerce.number().nullable().default(null),
  loanTotalYears: z.coerce.number().nullable().default(null),
  loanOriginalAmount: z.coerce.number().nullable().default(null),
  sortOrder: z.number().default(0),
  loanPaymentSortOrder: z.number().default(0),
  savingsGoalSortOrder: z.number().default(0),
  accountSavingsGoal: z.coerce.number().nullable().default(null),
  minAccountBalance: z.coerce.number().default(0),
  allowExtraPayment: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  depreciationRate: z.coerce.number().nullable().default(null),
  depreciationMethod: z.string().nullable().default(null),
  assetOriginalValue: z.coerce.number().nullable().default(null),
  assetResidualValue: z.coerce.number().nullable().default(null),
  assetUsefulLifeYears: z.coerce.number().nullable().default(null),
  assetStartAt: z.coerce.date().nullable().default(null),
  paymentCategoryId: z.string().uuid().nullable().optional(),
  interestCategoryId: z.string().uuid().nullable().optional(),
});

const amountAdjustmentModeSchema = z.enum(["NONE", "PERCENT", "FIXED"]);
const amountAdjustmentDirectionSchema = z.enum(["INCREASE", "DECREASE"]);

export const reoccurrenceSchema = z
  .object({
    id: z.number().default(0),
    accountId: z.string().min(1),
    accountRegisterId: z.coerce.number().min(1).default(0),
    intervalId: z.coerce.number().min(1).default(0),
    transferAccountRegisterId: z.coerce.number().optional(),
    intervalCount: z.coerce.number().min(1).default(0),
    adjustBeforeIfOnWeekend: z.boolean().default(false),
    categoryId: z.string().uuid().nullable().optional(),
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
    amountAdjustmentMode: amountAdjustmentModeSchema.default("NONE"),
    amountAdjustmentDirection: amountAdjustmentDirectionSchema
      .optional()
      .nullable(),
    amountAdjustmentValue: z.coerce.number().nullable().optional(),
    amountAdjustmentIntervalId: z.coerce.number().nullable().optional(),
    amountAdjustmentIntervalCount: z.coerce.number().min(1).default(1),
    amountAdjustmentAnchorAt: z
      .union([
        z.string(),
        z.date().transform((d) => d.toISOString()),
        z.undefined().transform(() => undefined),
        z.null().transform(() => undefined),
      ])
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.amountAdjustmentMode === "NONE") {
      return;
    }
    if (data.amountAdjustmentDirection == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Adjustment direction is required when an adjustment is enabled.",
        path: ["amountAdjustmentDirection"],
      });
    }
    if (data.amountAdjustmentValue == null || data.amountAdjustmentValue <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Adjustment value must be greater than zero.",
        path: ["amountAdjustmentValue"],
      });
    }
    if (data.amountAdjustmentIntervalId == null || data.amountAdjustmentIntervalId < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Adjustment interval is required when an adjustment is enabled.",
        path: ["amountAdjustmentIntervalId"],
      });
    }
  });

export const reoccurrenceSplitSchema = z.object({
  id: z.coerce.number().optional(),
  reoccurrenceId: z.coerce.number().optional(),
  transferAccountRegisterId: z.coerce.number().min(1),
  amount: z.coerce.number(),
  description: z.string().max(500).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  sortOrder: z.coerce.number().min(0).default(0),
});

export const reoccurrenceWithSplitsSchema = reoccurrenceSchema.extend({
  splits: z.array(reoccurrenceSplitSchema).optional().default([]),
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

export const createBudgetSchema = z.object({
  name: z.string().min(1).max(255),
});

export const renameBudgetSchema = z.object({
  name: z.string().min(1).max(255),
});

export const savingsGoalSchema = z.object({
  id: z.number(),
  accountId: z.string(),
  budgetId: z.number(),
  name: z.string().min(1).max(255),
  targetAmount: z.number().positive(),
  sourceAccountRegisterId: z.number(),
  targetAccountRegisterId: z.number(),
  priorityOverDebt: z.boolean(),
  ignoreMinBalance: z.boolean(),
  sortOrder: z.number(),
  isArchived: z.boolean(),
});

export const createSavingsGoalSchema = z.object({
  name: z.string().min(1).max(255),
  targetAmount: z.number().positive(),
  sourceAccountRegisterId: z.number(),
  targetAccountRegisterId: z.number(),
  priorityOverDebt: z.boolean().default(false),
  ignoreMinBalance: z.boolean().default(false),
});

export const updateSavingsGoalSchema = createSavingsGoalSchema.partial();

export const accountSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const categorySchema = z.object({
  id: z.string(),
  subCategoryId: z.string().nullable(),
  accountId: z.string().nullable(),
  name: z.string(),
  isArchived: z.boolean(),
  updatedAt: z.coerce.date(),
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
  typeId: z.coerce.number().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  isProjected: z.boolean().default(false),
  isReconciled: z.boolean().default(false),
  isCleared: z.boolean().default(false),
  isBalanceEntry: z.boolean().default(false),
  isPending: z.boolean().default(false),
  plaidId: z.string().nullable().optional(),
  plaidJson: z.any().nullable().optional(),
  createdAt: z.coerce.date().default(new Date()),
});

export const registerEntryMatchReoccurrenceSchema = z.object({
  registerEntryId: z.string().min(1),
  accountRegisterId: z.coerce.number().min(1),
  reoccurrenceId: z.coerce.number().min(1),
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
