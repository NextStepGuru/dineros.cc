// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { z } from "zod";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { plaidAccountSchema } from "~/schema/plaid";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  accountRegisterSchema,
  intervalSchema,
  publicProfileSchema,
  reoccurrenceSchema,
} from "~/schema/zod";

export type AccountType = {
  id: number;
  name: string;
  type: string;
  isCredit: boolean;
};

export type Reoccurrence = z.infer<typeof reoccurrenceSchema>;
export type Interval = z.infer<typeof intervalSchema>;
export type AccountRegister = z.infer<typeof accountRegisterSchema>;
export type User = z.infer<typeof publicProfileSchema>;

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

export type Lists = {
  reoccurrences: Reoccurrence[];
  intervals: Interval[];
  accountTypes: AccountType[];
  accountRegisters: AccountRegister[];
  budgets: Budget[];
  accounts: Account[];
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
  isCleared: boolean;
  isReconciled: boolean;
  isProjected: boolean;
  isBalanceEntry: boolean;
  isPending: boolean;
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
