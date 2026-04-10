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
                .map(String),
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
          transactionSyncEmail: z.boolean().optional(),
          connectionIssueEmail: z.boolean().optional(),
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

/** API/client profile shape — never includes password (hashes must not leave the server). */
export const publicProfileSchema = z.object({
  id: z.number(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.email("Invalid email address"),
  countryId: z.number().nullable().optional(),
  timezoneOffset: z.number().nullable().optional(),
  isDaylightSaving: z.boolean().nullable().optional(),
  settings: publicUserSettingsSchema,
});

/** Prisma user row with optional password hash for server-side parsing only. */
export const privateUserSchema = publicProfileSchema.extend({
  password: z.string().nullable().optional(),
  settings: privateUserSettingsSchema,
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  tokenChallenge: z.string().optional(),
});

export const userRoleSchema = z.enum(["USER", "ADMIN"]);

export const passwordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .max(128, "Password must be at most 128 characters"),
    confirmPassword: z
      .string()
      .min(8, "Confirm password must be at least 8 characters long")
      .max(128, "Confirm password must be at most 128 characters"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = passwordSchema.extend({
  currentPassword: z.string().min(1, "Current password is required"),
});

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().max(255).optional().default(""),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const adminUserUpdateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(255).optional(),
    lastName: z.string().trim().min(1).max(255).optional(),
    email: z.email().optional(),
    countryId: z.number().int().nullable().optional(),
    timezoneOffset: z.number().int().nullable().optional(),
    isDaylightSaving: z.boolean().nullable().optional(),
    role: userRoleSchema.optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const adminUserPasswordResetSchema = passwordSchema;

/** Admin audit log actions (server constants; not exhaustive). */
export const ADMIN_AUDIT_ACTIONS = {
  USER_UPDATE: "user.update",
  USER_PASSWORD_RESET: "user.password_reset", // NOSONAR S2068 — audit action slug
  ACCOUNT_RECALCULATE_QUEUED: "account.recalculate_queued",
  ACCOUNT_PLAID_SYNC_QUEUED: "account.plaid_sync_queued",
  ACCOUNT_BALANCE_ENTRIES_CLEANUP: "account.balance_entries_cleanup",
} as const;

export const adminAccountsQuerySchema = z.object({
  q: z.string().trim().max(255).optional().default(""),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const adminAuditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.string().trim().max(64).optional(),
  format: z.enum(["json", "csv"]).optional().default("json"),
  adminUserId: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return undefined;
      const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
      return Number.isInteger(n) && n > 0 ? n : undefined;
    }),
  targetUserId: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return undefined;
      const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
      return Number.isInteger(n) && n > 0 ? n : undefined;
    }),
});

/** Matches Prisma `NotificationKind`. */
export const adminNotificationKindSchema = z.enum([
  "FORECAST_RISK",
  "REOCCURRENCE_HEALTH",
]);

export const adminNotificationEventsQuerySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  budgetId: z.coerce.number().int().positive().optional(),
  kind: adminNotificationKindSchema.optional(),
  isActive: z.enum(["all", "true", "false"]).optional().default("all"),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const adminOpenAiRequestLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  purpose: z.string().trim().max(191).optional(),
  success: z.enum(["all", "true", "false"]).optional().default("all"),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  format: z.enum(["json", "csv"]).optional().default("json"),
});

export const adminIntegrationAlertsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  source: z.enum(["plaid", "openai", "all"]).default("all"),
  kind: z.string().trim().max(32).optional(),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  format: z.enum(["json", "csv"]).optional().default("json"),
});

export const adminPostmarkMessagesQuerySchema = z.object({
  recipient: z.email().max(500),
  count: z.coerce.number().int().min(1).max(50).default(20),
});

export const adminIntegrationJobLogsQuerySchema = z.object({
  source: z.string().trim().max(32).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const adminPlaidSyncLogsQuerySchema = z.object({
  syncMode: z.enum(["item_cursor", "legacy_token_batch"]).optional(),
  status: z.enum(["success", "partial", "failed"]).optional(),
  userId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const registerSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters long").max(128),
    confirmPassword: z
      .string()
      .min(8, "Confirm password must be at least 8 characters long")
      .max(128),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const accountInvitePermissionsSchema = z.object({
  canViewBudgets: z.boolean(),
  canInviteUsers: z.boolean(),
  canManageMembers: z.boolean(),
  allowedBudgetIds: z.array(z.number().int().positive()).nullable().optional(),
  allowedAccountRegisterIds: z
    .array(z.number().int().positive())
    .nullable()
    .optional(),
});

export const accountInviteCreateSchema = z
  .object({
    accountIds: z.array(z.string().min(1)).min(1).max(25),
    email: z.email("Invalid email address"),
    permissions: accountInvitePermissionsSchema,
  })
  .strict();

export const accountInviteAcceptSchema = z.object({
  token: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
});

export const accountRegisterSchema = z.object({
  id: z.number(),
  accountId: z.string().min(1),
  subAccountRegisterId: z.coerce
    .number()
    .min(1)
    .nullable()
    .transform((a) => a ?? undefined)
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
  paymentCategoryId: z.uuid().nullable().optional(),
  interestCategoryId: z.uuid().nullable().optional(),
  vehicleDetails: z.unknown().nullable().optional(),
  walletAddress: z
    .preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.string().nullable().optional(),
    )
    .optional(),
  selectedChainIds: z.array(z.number().int().positive()).optional(),
  alchemyLastSyncAt: z.coerce.date().nullable().optional(),
});

const assetEstimateConditionSchema = z.enum([
  "excellent",
  "good",
  "fair",
  "poor",
]);

/** Body for POST /api/vehicle-value-estimate */
export const vehicleValueEstimateRequestSchema = z.object({
  accountId: z.string().min(1),
  accountRegisterId: z.coerce.number().int().positive().optional(),
  year: z.coerce.number().int().min(1900).max(2100),
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  trim: z.string().max(100).optional(),
  mileage: z.coerce.number().nonnegative(),
  condition: assetEstimateConditionSchema,
  zip: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().regex(/^\d{5}$/).optional(),
  ),
  purchasePriceHint: z.coerce.number().nonnegative().optional(),
  vinLast4: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().regex(/^[A-Za-z0-9]{1,4}$/).optional(),
  ),
});

export const houseValueEstimateRequestSchema = z.object({
  category: z.literal("house"),
  accountId: z.string().min(1),
  accountRegisterId: z.coerce.number().int().positive().optional(),
  bedrooms: z.coerce.number().nonnegative(),
  bathrooms: z.coerce.number().nonnegative(),
  squareFootage: z.coerce.number().positive(),
  yearBuilt: z.coerce.number().int().min(1800).max(2100),
  lotSizeAcres: z.coerce.number().positive().optional(),
  zip: z.string().regex(/^\d{5}$/),
  propertyType: z.enum([
    "single-family",
    "condo",
    "townhouse",
    "multi-family",
  ]),
  condition: assetEstimateConditionSchema,
  purchasePriceHint: z.coerce.number().nonnegative().optional(),
});

export const boatValueEstimateRequestSchema = z.object({
  category: z.literal("boat"),
  accountId: z.string().min(1),
  accountRegisterId: z.coerce.number().int().positive().optional(),
  year: z.coerce.number().int().min(1900).max(2100),
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  lengthFeet: z.coerce.number().positive(),
  engineType: z.enum(["outboard", "inboard", "sail", "jet"]),
  engineHours: z.coerce.number().nonnegative().optional(),
  condition: assetEstimateConditionSchema,
  zip: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().regex(/^\d{5}$/).optional(),
  ),
  purchasePriceHint: z.coerce.number().nonnegative().optional(),
});

export const rvValueEstimateRequestSchema = z.object({
  category: z.literal("rv"),
  accountId: z.string().min(1),
  accountRegisterId: z.coerce.number().int().positive().optional(),
  year: z.coerce.number().int().min(1900).max(2100),
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  rvClass: z.enum([
    "class-a",
    "class-b",
    "class-c",
    "travel-trailer",
    "fifth-wheel",
  ]),
  lengthFeet: z.coerce.number().positive(),
  mileage: z.coerce.number().nonnegative(),
  condition: assetEstimateConditionSchema,
  zip: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().regex(/^\d{5}$/).optional(),
  ),
  purchasePriceHint: z.coerce.number().nonnegative().optional(),
});

export const motorcycleValueEstimateRequestSchema = z.object({
  category: z.literal("motorcycle"),
  accountId: z.string().min(1),
  accountRegisterId: z.coerce.number().int().positive().optional(),
  year: z.coerce.number().int().min(1900).max(2100),
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  mileage: z.coerce.number().nonnegative(),
  engineCC: z.coerce.number().positive().optional(),
  condition: assetEstimateConditionSchema,
  zip: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().regex(/^\d{5}$/).optional(),
  ),
  purchasePriceHint: z.coerce.number().nonnegative().optional(),
});

export const vehicleAssetEstimateRequestSchema =
  vehicleValueEstimateRequestSchema.extend({
    category: z.literal("vehicle"),
  });

/** Discriminated union for POST /api/asset-value-estimate */
export const assetValueEstimateRequestSchema = z.discriminatedUnion("category", [
  vehicleAssetEstimateRequestSchema,
  houseValueEstimateRequestSchema,
  boatValueEstimateRequestSchema,
  rvValueEstimateRequestSchema,
  motorcycleValueEstimateRequestSchema,
]);

/** Parsed JSON from the model for asset valuation (all categories) */
export const vehicleValueEstimateAiResultSchema = z.object({
  estimatedValueMid: z.number(),
  estimatedValueLow: z.number(),
  estimatedValueHigh: z.number(),
  currency: z.string().min(1).max(16).default("USD"),
  rationale: z.string().max(800),
  disclaimer: z.string().min(1).max(2000),
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
    categoryId: z.uuid().nullable().optional(),
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
        code: "custom",
        message: "Adjustment direction is required when an adjustment is enabled.",
        path: ["amountAdjustmentDirection"],
      });
    }
    if (data.amountAdjustmentMode === "PERCENT") {
      if (
        data.amountAdjustmentValue == null ||
        data.amountAdjustmentValue <= 0 ||
        data.amountAdjustmentValue > 1
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Percent adjustment must be greater than 0% and at most 100%.",
          path: ["amountAdjustmentValue"],
        });
      }
    } else if (
      data.amountAdjustmentValue == null ||
      data.amountAdjustmentValue <= 0
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Fixed adjustment value must be greater than zero.",
        path: ["amountAdjustmentValue"],
      });
    }
    if (data.amountAdjustmentIntervalId == null || data.amountAdjustmentIntervalId < 1) {
      ctx.addIssue({
        code: "custom",
        message: "Adjustment interval is required when an adjustment is enabled.",
        path: ["amountAdjustmentIntervalId"],
      });
    }
  });

const reoccurrenceSplitAmountModeSchema = z.enum(["FIXED", "PERCENT"]);

export const reoccurrenceSplitSchema = z
  .object({
    id: z.coerce.number().optional(),
    reoccurrenceId: z.coerce.number().optional(),
    transferAccountRegisterId: z.coerce.number().min(1),
    amountMode: reoccurrenceSplitAmountModeSchema.default("FIXED"),
    amount: z.coerce.number(),
    description: z.string().max(500).optional(),
    categoryId: z.uuid().nullable().optional(),
    sortOrder: z.coerce.number().min(0).default(0),
  })
  .superRefine((data, ctx) => {
    if (data.amountMode === "PERCENT") {
      if (
        !Number.isFinite(data.amount) ||
        data.amount <= 0 ||
        data.amount > 1
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Split percentage must be greater than 0% and at most 100%.",
          path: ["amount"],
        });
      }
    }
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
  /** When true, create a new financial Account and clone default budget + categories into it. */
  duplicateFinancialAccount: z.boolean().optional(),
  /** Optional budget to copy from when duplicating (defaults to default budget). */
  sourceBudgetId: z.coerce.number().int().positive().optional(),
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
  categoryId: z.uuid().nullable(),
  sortOrder: z.number(),
  isArchived: z.boolean(),
});

export const createSavingsGoalSchema = z.object({
  name: z.string().min(1).max(255),
  targetAmount: z.coerce.number().positive(),
  sourceAccountRegisterId: z.coerce.number(),
  targetAccountRegisterId: z.coerce.number(),
  priorityOverDebt: z.boolean().default(false),
  ignoreMinBalance: z.boolean().default(false),
  categoryId: z.union([z.uuid(), z.null()]).optional(),
});

export const updateSavingsGoalSchema = createSavingsGoalSchema.partial();

export const cashOnHandSchema = z.object({
  ones: z.number().int().min(0),
  fives: z.number().int().min(0),
  tens: z.number().int().min(0),
  twenties: z.number().int().min(0),
  fifties: z.number().int().min(0),
  hundreds: z.number().int().min(0),
});

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
      .min(8, "Password must be at least 8 characters long")
      .max(128, "Password must be at most 128 characters"),
    confirmPassword: z
      .string()
      .min(8, "Confirm password must be at least 8 characters long")
      .max(128, "Confirm password must be at most 128 characters"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
