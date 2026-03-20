
import { z } from "zod";

import { plaidAccountSchema } from "~/schema/plaid";

import {
  accountRegisterSchema,
  intervalSchema,
  publicProfileSchema,
  reoccurrenceSchema,
  reoccurrenceSplitSchema,
  reoccurrenceWithSplitsSchema,
  savingsGoalSchema,
} from "~/schema/zod";

export type AccountType = {
  id: number;
  name: string;
  type: string;
  isCredit: boolean;
};

export type ReoccurrenceBase = z.infer<typeof reoccurrenceSchema>;
export type ReoccurrenceSplit = z.infer<typeof reoccurrenceSplitSchema>;
export type Reoccurrence = z.infer<typeof reoccurrenceWithSplitsSchema>;
export type Interval = z.infer<typeof intervalSchema>;
export type AccountRegister = z.infer<typeof accountRegisterSchema>;
export type User = z.infer<typeof publicProfileSchema> & {
  /** Present on `/api/user`; omitted on some other profile responses. */
  isAdmin?: boolean;
};

export type Budget = {
  id: number;
  accountId: string;
  name: string;
  isArchived: boolean;
  isDefault: boolean;
  userId: number | null;
};

export type Account = {
  id: string;
  name: string;
};

export type Category = {
  id: string;
  subCategoryId: string | null;
  accountId: string | null;
  name: string;
  isArchived: boolean;
  updatedAt: string;
};

export type SavingsGoal = z.infer<typeof savingsGoalSchema>;

export type Lists = {
  reoccurrences: Reoccurrence[];
  intervals: Interval[];
  accountTypes: AccountType[];
  accountRegisters: AccountRegister[];
  budgets: Budget[];
  accounts: Account[];
  categories: Category[];
  savingsGoals: SavingsGoal[];
};

export type AccountSnapshot = {
  id: number;
  accountId: string;
  createdAt: string;
};

/** Row returned from GET /api/snapshot/:id for each register at snapshot time */
export type AccountSnapshotRegisterRow = {
  registerSnapshotId: number;
  accountRegisterId: number;
  subAccountRegisterId: number | null;
  collateralAssetRegisterId: number | null;
  name: string;
  balance: number;
  latestBalance: number;
  typeId: number;
};

export type AccountSnapshotDetail = {
  id: number;
  accountId: string;
  createdAt: string;
  registers: AccountSnapshotRegisterRow[];
};

export type RegisterEntry = {
  id?: string;
  accountRegisterId: number;
  sourceAccountRegisterId?: number;
  createdAt: string;
  description: string;
  reoccurrenceId?: number | null;
  amount: number;
  balance: number;
  typeId?: number | null;
  categoryId?: string | null;
  isCleared: boolean;
  isReconciled: boolean;
  isProjected: boolean;
  isBalanceEntry: boolean;
  isPending: boolean;
  /** Set when the row is tied to a Plaid transaction (import or match). */
  plaidId?: string | null;
};

export type PlaidAccount = z.infer<typeof plaidAccountSchema>;

// Vue component type helpers
export type VueComponent = {
  $props: Record<string, any>
  $emit: Record<string, any>
  $slots: Record<string, any>
}

// Nuxt UI component types
export type UInputProps = {
  id?: string
  modelValue?: string | number
  type?: string
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  class?: string | Record<string, boolean>
}

export type UButtonProps = {
  color?: string
  size?: string
  type?: string
  disabled?: boolean
  loading?: boolean
  block?: boolean
  class?: string | Record<string, boolean>
}

export type UFormFieldProps = {
  label?: string
  for?: string
  hint?: string
  class?: string | Record<string, boolean>
}

export type UFormProps = {
  state?: Record<string, any>
  schema?: any
  class?: string | Record<string, boolean>
  disabled?: boolean
}

export type UCardProps = {
  class?: string | Record<string, boolean>
}
