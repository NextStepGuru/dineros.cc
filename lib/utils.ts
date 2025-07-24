import type { FormErrorEvent } from "@nuxt/ui";
import type { Toast } from "@nuxt/ui/runtime/composables/useToast.js";
import type { AccountRegister, AccountType, Interval } from "~/types/types";

export const getIntervalLabel = (intervalId: number, intervals: Interval[]) => {
  const item = intervals.find((i) => i.id === intervalId);
  return item?.name || "Unknown";
};
export const getAccountTypeLabel = (
  typeId: number,
  accountTypes: AccountType[]
) => {
  const type = accountTypes.find((t) => t.id === typeId);
  return type?.name || "Unknown";
};

export const getAccountRegisterLabel = (
  accountRegisterId: number,
  accountRegisters: AccountRegister[]
) => {
  const item = accountRegisters.find((r) => (r.id = accountRegisterId));
  return item?.name || "Unknown";
};

export const formatDate = (
  dt: string | Date | number | null | undefined
): string | undefined => {
  if (typeof dt === "string") {
    const date = new Date(dt);
    const localDate = new Date(date.getTime());
    return localDate.toISOString().split("T")[0];
  }
  return undefined;
};

export const handleError = (
  event: FormErrorEvent | Error,
  toast: {
    toasts: globalThis.Ref<Toast[], Toast[]>;
    add: (toast: Partial<Toast>) => Toast;
    update: (id: string | number, toast: Omit<Partial<Toast>, "id">) => void;
    remove: (id: string | number) => void;
    clear: () => void;
  }
) => {
  if (event instanceof Error) {
    toast.add({ color: "error", description: event.message });
  } else {
    const errorMessages = event.errors
      .map((err) => `${err.name}: ${err.message}`)
      .join(", ");
    toast.add({ color: "error", description: errorMessages });

    if (event?.errors?.[0]?.id) {
      const element = document.getElementById(event.errors[0].id);
      element?.focus();
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
  return null;
};

export const formatAccountRegisters = (
  accountRegisters: AccountRegister[]
): AccountRegister[] => {
  // Create a map of parent accounts for O(1) lookup
  const parentMap = new Map<number, AccountRegister>();
  const children: AccountRegister[] = [];

  // Single pass to separate parents and children
  for (const register of accountRegisters) {
    if (!register.subAccountRegisterId) {
      parentMap.set(register.id, register);
    } else {
      children.push(register);
    }
  }

  // Build result with parents followed by their children
  const result: AccountRegister[] = [];
  for (const parent of parentMap.values()) {
    result.push({ ...parent });

    // Add children for this parent
    for (const child of children) {
      if (child.subAccountRegisterId === parent.id) {
        result.push({ ...child, name: ` ↳ ${child.name}` });
      }
    }
  }

  return result;
};

export const mapPlaidTypesToAccountTypes = (
  plaidType?: string | null
): number => {
  const plaidSubTypes: Record<string, number> = {
    "401a": 10,
    "401k": 10,
    "403B": 10,
    "457b": 10,
    "529": 16,
    auto: 13,
    brokerage: 16,
    business: 16,
    "cash isa": 16,
    "cash management": 16,
    cd: 16,
    checking: 1,
    commercial: 16,
    construction: 16,
    consumer: 16,
    "credit card": 4,
    "crypto exchange": 16,
    ebt: 16,
    "education savings account": 2,
    "fixed annuity": 16,
    gic: 16,
    "health reimbursement arrangement": 16,
    "home equity": 16,
    hsa: 8,
    isa: 16,
    ira: 9,
    keogh: 16,
    lif: 16,
    "life insurance": 16,
    "line of credit": 7,
    lira: 9,
    loan: 5,
    lrif: 16,
    lrsp: 16,
    "money market": 16,
    mortgage: 6,
    "mutual fund": 16,
    "non-custodial wallet": 16,
    "non-taxable brokerage account": 16,
    other: 16,
    "other insurance": 16,
    "other annuity": 16,
    overdraft: 16,
    paypal: 16,
    payroll: 16,
    pension: 16,
    prepaid: 16,
    prif: 16,
    "profit sharing plan": 16,
    rdsp: 16,
    resp: 16,
    retirement: 11,
    rlif: 16,
    roth: 16,
    "roth 401k": 16,
    rrif: 16,
    rrsp: 16,
    sarsep: 16,
    savings: 2,
    "sep ira": 9,
    "simple ira": 9,
    sipp: 16,
    "stock plan": 16,
    student: 12,
    "thrift savings plan": 2,
    tfsa: 16,
    trust: 16,
    ugma: 16,
    utma: 16,
    "variable annuity": 16,
  };

  return plaidSubTypes[plaidType ? plaidType : "unknown"] || 16;
};

export const formatCurrencyOptions: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  style: "currency",
  currency: "USD",
  currencySign: "accounting",
};

// export const adjustBeforeIfOnWeekend = function (
//   date: moment.Moment
// ): moment.Moment {
//   if (date.day() === 6) {
//     // Saturday
//     return date.subtract(1, "days");
//   } else if (date.day() === 0) {
//     // Sunday
//     return date.subtract(2, "days");
//   }

//   return date;
// };
