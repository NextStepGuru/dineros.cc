<script setup lang="ts">
import { nextTick } from "vue";
import type { FormSubmitEvent } from "@nuxt/ui";
import {
  handleError,
  formatCurrencyOptions,
  formatAccountRegisters,
  isCryptoAccountType,
} from "~/lib/utils";
import { formatMoneyUsd } from "~/lib/bankers-rounding";
import {
  bumpCashDenomCount,
  CASH_DENOM_CONFIG as cashDenomConfig,
  subtotalForCashDenom,
  totalDollarsFromCashCounts,
  ZERO_CASH_COUNTS,
  type CashDenomCounts,
  type CashDenomKey,
} from "~/lib/cashDenominations";
import { buildSortedCategorySelectItems } from "~/lib/categorySelect";
import type { z } from "zod";
import {
  accountRegisterSchema,
  vehicleValueEstimateAiResultSchema,
} from "~/schema/zod";
import type { AccountRegister } from "~/types/types";
import {
  APPRECIATING_ASSET_TYPE_IDS,
  ASSET_TYPE_CATEGORY_MAP,
  DEPRECIATING_ASSET_TYPE_IDS,
  ESTIMATABLE_ASSET_TYPE_IDS,
} from "~/consts";
import type { AssetEstimateCategory } from "~/consts";

/** Script alias so linters see template use of cash denomination metadata. */
const CASH_DENOM_CONFIG = cashDenomConfig;

type VehicleDetailsForm = {
  year: number;
  make: string;
  model: string;
  trim: string;
  mileage: number;
  condition: "excellent" | "good" | "fair" | "poor";
  zip: string;
  vinLast4: string;
  purchasePriceHint: number | null;
};

type VehicleEstimateResult = z.infer<typeof vehicleValueEstimateAiResultSchema>;

function defaultVehicleDetails(): VehicleDetailsForm {
  return {
    year: new Date().getFullYear(),
    make: "",
    model: "",
    trim: "",
    mileage: 0,
    condition: "good",
    zip: "",
    vinLast4: "",
    purchasePriceHint: null,
  };
}

function parseVehicleDetails(raw: unknown): VehicleDetailsForm {
  const d = defaultVehicleDetails();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return d;
  }
  const o = raw as Record<string, unknown>;
  const year = typeof o.year === "number" && Number.isFinite(o.year) ? o.year : d.year;
  const make = typeof o.make === "string" ? o.make : d.make;
  const model = typeof o.model === "string" ? o.model : d.model;
  const trim = typeof o.trim === "string" ? o.trim : d.trim;
  const mileage =
    typeof o.mileage === "number" && Number.isFinite(o.mileage) && o.mileage >= 0
      ? o.mileage
      : d.mileage;
  const condition =
    o.condition === "excellent" ||
    o.condition === "good" ||
    o.condition === "fair" ||
    o.condition === "poor"
      ? o.condition
      : d.condition;
  const zip = typeof o.zip === "string" ? o.zip : d.zip;
  const vinLast4 = typeof o.vinLast4 === "string" ? o.vinLast4 : d.vinLast4;
  const purchasePriceHint =
    typeof o.purchasePriceHint === "number" && Number.isFinite(o.purchasePriceHint)
      ? o.purchasePriceHint
      : null;
  return {
    year,
    make,
    model,
    trim,
    mileage,
    condition,
    zip,
    vinLast4,
    purchasePriceHint,
  };
}

type HouseDetailsForm = {
  bedrooms: number;
  bathrooms: number;
  squareFootage: number;
  yearBuilt: number;
  lotSizeAcres: number | null;
  zip: string;
  propertyType: "single-family" | "condo" | "townhouse" | "multi-family";
  condition: "excellent" | "good" | "fair" | "poor";
  purchasePriceHint: number | null;
};

type BoatDetailsForm = {
  year: number;
  make: string;
  model: string;
  lengthFeet: number;
  engineType: "outboard" | "inboard" | "sail" | "jet";
  engineHours: number | null;
  condition: "excellent" | "good" | "fair" | "poor";
  zip: string;
  purchasePriceHint: number | null;
};

type RvDetailsForm = {
  year: number;
  make: string;
  model: string;
  rvClass: "class-a" | "class-b" | "class-c" | "travel-trailer" | "fifth-wheel";
  lengthFeet: number;
  mileage: number;
  condition: "excellent" | "good" | "fair" | "poor";
  zip: string;
  purchasePriceHint: number | null;
};

type MotorcycleDetailsForm = {
  year: number;
  make: string;
  model: string;
  mileage: number;
  engineCC: number | null;
  condition: "excellent" | "good" | "fair" | "poor";
  zip: string;
  purchasePriceHint: number | null;
};

function defaultHouseDetails(): HouseDetailsForm {
  return {
    bedrooms: 3,
    bathrooms: 2,
    squareFootage: 1500,
    yearBuilt: new Date().getFullYear() - 10,
    lotSizeAcres: null,
    zip: "",
    propertyType: "single-family",
    condition: "good",
    purchasePriceHint: null,
  };
}

function defaultBoatDetails(): BoatDetailsForm {
  return {
    year: new Date().getFullYear() - 5,
    make: "",
    model: "",
    lengthFeet: 20,
    engineType: "outboard",
    engineHours: null,
    condition: "good",
    zip: "",
    purchasePriceHint: null,
  };
}

function defaultRvDetails(): RvDetailsForm {
  return {
    year: new Date().getFullYear() - 3,
    make: "",
    model: "",
    rvClass: "class-c",
    lengthFeet: 28,
    mileage: 0,
    condition: "good",
    zip: "",
    purchasePriceHint: null,
  };
}

function defaultMotorcycleDetails(): MotorcycleDetailsForm {
  return {
    year: new Date().getFullYear() - 2,
    make: "",
    model: "",
    mileage: 0,
    engineCC: null,
    condition: "good",
    zip: "",
    purchasePriceHint: null,
  };
}

function parseHouseDetails(raw: unknown): HouseDetailsForm {
  const d = defaultHouseDetails();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return d;
  }
  const o = raw as Record<string, unknown>;
  const bedrooms =
    typeof o.bedrooms === "number" && Number.isFinite(o.bedrooms) && o.bedrooms >= 0
      ? o.bedrooms
      : d.bedrooms;
  const bathrooms =
    typeof o.bathrooms === "number" && Number.isFinite(o.bathrooms) && o.bathrooms >= 0
      ? o.bathrooms
      : d.bathrooms;
  const squareFootage =
    typeof o.squareFootage === "number" &&
    Number.isFinite(o.squareFootage) &&
    o.squareFootage > 0
      ? o.squareFootage
      : d.squareFootage;
  const yearBuilt =
    typeof o.yearBuilt === "number" && Number.isFinite(o.yearBuilt)
      ? o.yearBuilt
      : d.yearBuilt;
  const lotSizeAcres =
    typeof o.lotSizeAcres === "number" && Number.isFinite(o.lotSizeAcres) && o.lotSizeAcres > 0
      ? o.lotSizeAcres
      : null;
  const zip = typeof o.zip === "string" ? o.zip : d.zip;
  const propertyType =
    o.propertyType === "single-family" ||
    o.propertyType === "condo" ||
    o.propertyType === "townhouse" ||
    o.propertyType === "multi-family"
      ? o.propertyType
      : d.propertyType;
  const condition =
    o.condition === "excellent" ||
    o.condition === "good" ||
    o.condition === "fair" ||
    o.condition === "poor"
      ? o.condition
      : d.condition;
  const purchasePriceHint =
    typeof o.purchasePriceHint === "number" && Number.isFinite(o.purchasePriceHint)
      ? o.purchasePriceHint
      : null;
  return {
    bedrooms,
    bathrooms,
    squareFootage,
    yearBuilt,
    lotSizeAcres,
    zip,
    propertyType,
    condition,
    purchasePriceHint,
  };
}

function parseBoatDetails(raw: unknown): BoatDetailsForm {
  const d = defaultBoatDetails();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return d;
  }
  const o = raw as Record<string, unknown>;
  const year =
    typeof o.year === "number" && Number.isFinite(o.year) ? o.year : d.year;
  const make = typeof o.make === "string" ? o.make : d.make;
  const model = typeof o.model === "string" ? o.model : d.model;
  const lengthFeet =
    typeof o.lengthFeet === "number" && Number.isFinite(o.lengthFeet) && o.lengthFeet > 0
      ? o.lengthFeet
      : d.lengthFeet;
  const engineType =
    o.engineType === "outboard" ||
    o.engineType === "inboard" ||
    o.engineType === "sail" ||
    o.engineType === "jet"
      ? o.engineType
      : d.engineType;
  const engineHours =
    typeof o.engineHours === "number" && Number.isFinite(o.engineHours) && o.engineHours >= 0
      ? o.engineHours
      : null;
  const condition =
    o.condition === "excellent" ||
    o.condition === "good" ||
    o.condition === "fair" ||
    o.condition === "poor"
      ? o.condition
      : d.condition;
  const zip = typeof o.zip === "string" ? o.zip : d.zip;
  const purchasePriceHint =
    typeof o.purchasePriceHint === "number" && Number.isFinite(o.purchasePriceHint)
      ? o.purchasePriceHint
      : null;
  return {
    year,
    make,
    model,
    lengthFeet,
    engineType,
    engineHours,
    condition,
    zip,
    purchasePriceHint,
  };
}

function parseRvDetails(raw: unknown): RvDetailsForm {
  const d = defaultRvDetails();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return d;
  }
  const o = raw as Record<string, unknown>;
  const year =
    typeof o.year === "number" && Number.isFinite(o.year) ? o.year : d.year;
  const make = typeof o.make === "string" ? o.make : d.make;
  const model = typeof o.model === "string" ? o.model : d.model;
  const rvClass =
    o.rvClass === "class-a" ||
    o.rvClass === "class-b" ||
    o.rvClass === "class-c" ||
    o.rvClass === "travel-trailer" ||
    o.rvClass === "fifth-wheel"
      ? o.rvClass
      : d.rvClass;
  const lengthFeet =
    typeof o.lengthFeet === "number" && Number.isFinite(o.lengthFeet) && o.lengthFeet > 0
      ? o.lengthFeet
      : d.lengthFeet;
  const mileage =
    typeof o.mileage === "number" && Number.isFinite(o.mileage) && o.mileage >= 0
      ? o.mileage
      : d.mileage;
  const condition =
    o.condition === "excellent" ||
    o.condition === "good" ||
    o.condition === "fair" ||
    o.condition === "poor"
      ? o.condition
      : d.condition;
  const zip = typeof o.zip === "string" ? o.zip : d.zip;
  const purchasePriceHint =
    typeof o.purchasePriceHint === "number" && Number.isFinite(o.purchasePriceHint)
      ? o.purchasePriceHint
      : null;
  return {
    year,
    make,
    model,
    rvClass,
    lengthFeet,
    mileage,
    condition,
    zip,
    purchasePriceHint,
  };
}

function parseMotorcycleDetails(raw: unknown): MotorcycleDetailsForm {
  const d = defaultMotorcycleDetails();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return d;
  }
  const o = raw as Record<string, unknown>;
  const year =
    typeof o.year === "number" && Number.isFinite(o.year) ? o.year : d.year;
  const make = typeof o.make === "string" ? o.make : d.make;
  const model = typeof o.model === "string" ? o.model : d.model;
  const mileage =
    typeof o.mileage === "number" && Number.isFinite(o.mileage) && o.mileage >= 0
      ? o.mileage
      : d.mileage;
  const engineCC =
    typeof o.engineCC === "number" && Number.isFinite(o.engineCC) && o.engineCC > 0
      ? o.engineCC
      : null;
  const condition =
    o.condition === "excellent" ||
    o.condition === "good" ||
    o.condition === "fair" ||
    o.condition === "poor"
      ? o.condition
      : d.condition;
  const zip = typeof o.zip === "string" ? o.zip : d.zip;
  const purchasePriceHint =
    typeof o.purchasePriceHint === "number" && Number.isFinite(o.purchasePriceHint)
      ? o.purchasePriceHint
      : null;
  return {
    year,
    make,
    model,
    mileage,
    engineCC,
    condition,
    zip,
    purchasePriceHint,
  };
}

function parseAssetDetailsBlob(typeId: number, raw: unknown): unknown {
  const cat: AssetEstimateCategory | undefined = ASSET_TYPE_CATEGORY_MAP[typeId];
  if (cat === "vehicle") {
    return { category: "vehicle" as const, ...parseVehicleDetails(raw) };
  }
  if (cat === "house") {
    return { category: "house" as const, ...parseHouseDetails(raw) };
  }
  if (cat === "boat") {
    return { category: "boat" as const, ...parseBoatDetails(raw) };
  }
  if (cat === "rv") {
    return { category: "rv" as const, ...parseRvDetails(raw) };
  }
  if (cat === "motorcycle") {
    return { category: "motorcycle" as const, ...parseMotorcycleDetails(raw) };
  }
  return parseVehicleDetails(raw);
}

export type ModelAccountRegisterProps = {
  id: number;
  title: string;
  description: string;
  accountRegister: AccountRegister;
  /** When set (e.g. `"cash"`), selects that tab if present for the account type. */
  initialTab?: string;
  callback: (data: AccountRegister) => void;
  cancel: () => void;
};

const { $api } = useNuxtApp();

const isSaving = ref(false);
const isDeleting = ref(false);
const showArchiveConfirm = ref(false);

const form = ref<{ submit?: () => void } | null>(null);
const toast = useToast();
const listStore = useListStore();

const props = defineProps<ModelAccountRegisterProps>();

const { today } = useToday();

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateInputString(value: unknown): string {
  const parsed = toNullableDate(value);
  if (!parsed) return "";
  return parsed.toISOString().split("T")[0];
}

function normalizeAccountRegisterState(
  accountRegister: AccountRegister,
): AccountRegister {
  return {
    ...accountRegister,
    typeId: toNullableNumber(accountRegister.typeId) ?? 0,
    budgetId: toNullableNumber(accountRegister.budgetId) ?? 0,
    subAccountRegisterId: toNullableNumber(
      accountRegister.subAccountRegisterId,
    ),
    balance: toNullableNumber(accountRegister.balance) ?? 0,
    latestBalance: toNullableNumber(accountRegister.latestBalance) ?? 0,
    minPayment: toNullableNumber(accountRegister.minPayment),
    statementAt: toNullableDate(accountRegister.statementAt) ?? today.value,
    statementIntervalId: toNullableNumber(accountRegister.statementIntervalId),
    apr1: toNullableNumber(accountRegister.apr1),
    apr1StartAt: toNullableDate(accountRegister.apr1StartAt),
    apr2: toNullableNumber(accountRegister.apr2),
    apr2StartAt: toNullableDate(accountRegister.apr2StartAt),
    apr3: toNullableNumber(accountRegister.apr3),
    apr3StartAt: toNullableDate(accountRegister.apr3StartAt),
    targetAccountRegisterId: toNullableNumber(
      accountRegister.targetAccountRegisterId,
    ),
    collateralAssetRegisterId: toNullableNumber(
      accountRegister.collateralAssetRegisterId,
    ),
    loanStartAt: toNullableDate(accountRegister.loanStartAt),
    loanPaymentsPerYear: toNullableNumber(accountRegister.loanPaymentsPerYear),
    loanTotalYears: toNullableNumber(accountRegister.loanTotalYears),
    loanOriginalAmount: toNullableNumber(accountRegister.loanOriginalAmount),
    sortOrder: toNullableNumber(accountRegister.sortOrder) ?? 0,
    loanPaymentSortOrder:
      toNullableNumber(accountRegister.loanPaymentSortOrder) ?? 0,
    savingsGoalSortOrder:
      toNullableNumber(accountRegister.savingsGoalSortOrder) ?? 0,
    accountSavingsGoal: toNullableNumber(accountRegister.accountSavingsGoal),
    minAccountBalance: toNullableNumber(accountRegister.minAccountBalance) ?? 0,
    depreciationRate: toNullableNumber(accountRegister.depreciationRate),
    depreciationMethod:
      (accountRegister.depreciationMethod as string | null) ?? null,
    assetOriginalValue: toNullableNumber(accountRegister.assetOriginalValue),
    assetResidualValue: toNullableNumber(accountRegister.assetResidualValue),
    assetUsefulLifeYears: toNullableNumber(accountRegister.assetUsefulLifeYears),
    assetStartAt: toNullableDate(accountRegister.assetStartAt),
    paymentCategoryId: accountRegister.paymentCategoryId ?? null,
    interestCategoryId: accountRegister.interestCategoryId ?? null,
    vehicleDetails: parseAssetDetailsBlob(
      toNullableNumber(accountRegister.typeId) ?? 0,
      (accountRegister as AccountRegister & { vehicleDetails?: unknown })
        .vehicleDetails,
    ) as AccountRegister["vehicleDetails"],
    walletAddress:
      (accountRegister as AccountRegister & { walletAddress?: string | null })
        .walletAddress ?? null,
    alchemyLastSyncAt: toNullableDate(
      (accountRegister as AccountRegister & { alchemyLastSyncAt?: unknown })
        .alchemyLastSyncAt,
    ),
  };
}

const formState = ref<AccountRegister>(
  normalizeAccountRegisterState(props.accountRegister),
);

const vehicleDetailsLocal = reactive<VehicleDetailsForm>(
  parseVehicleDetails(
    (props.accountRegister as AccountRegister & { vehicleDetails?: unknown })
      .vehicleDetails,
  ),
);

const houseDetailsLocal = reactive<HouseDetailsForm>(
  parseHouseDetails(
    (props.accountRegister as AccountRegister & { vehicleDetails?: unknown })
      .vehicleDetails,
  ),
);

const boatDetailsLocal = reactive<BoatDetailsForm>(
  parseBoatDetails(
    (props.accountRegister as AccountRegister & { vehicleDetails?: unknown })
      .vehicleDetails,
  ),
);

const rvDetailsLocal = reactive<RvDetailsForm>(
  parseRvDetails(
    (props.accountRegister as AccountRegister & { vehicleDetails?: unknown })
      .vehicleDetails,
  ),
);

const motorcycleDetailsLocal = reactive<MotorcycleDetailsForm>(
  parseMotorcycleDetails(
    (props.accountRegister as AccountRegister & { vehicleDetails?: unknown })
      .vehicleDetails,
  ),
);

function syncEstimateDetailLocals(typeId: number, raw: unknown) {
  const cat = ASSET_TYPE_CATEGORY_MAP[typeId];
  if (cat === "vehicle") {
    Object.assign(vehicleDetailsLocal, parseVehicleDetails(raw));
    return;
  }
  if (cat === "house") {
    Object.assign(houseDetailsLocal, parseHouseDetails(raw));
    return;
  }
  if (cat === "boat") {
    Object.assign(boatDetailsLocal, parseBoatDetails(raw));
    return;
  }
  if (cat === "rv") {
    Object.assign(rvDetailsLocal, parseRvDetails(raw));
    return;
  }
  if (cat === "motorcycle") {
    Object.assign(motorcycleDetailsLocal, parseMotorcycleDetails(raw));
    return;
  }
  Object.assign(vehicleDetailsLocal, parseVehicleDetails(raw));
}

const isEstimatingAsset = ref(false);
const lastAssetEstimate = ref<VehicleEstimateResult | null>(null);

const fileInput = ref<any>(null);

const selectedAccountType = computed(() => {
  return listStore.getAccountTypes.find(
    (type) => type.id === formState.value.typeId,
  );
});

const isSelectedAccountTypeCredit = computed(() => {
  return selectedAccountType.value?.isCredit === true;
});

const isSelectedAccountTypeChecking = computed(() => {
  return selectedAccountType.value?.id === 1;
});

const isSelectedAccountTypeSavings = computed(() => {
  return selectedAccountType.value?.id === 2;
});

const isSelectedAccountTypeMortgage = computed(() => {
  return selectedAccountType.value?.type === "mortgage";
});

const isSelectedAccountTypeWithInterest = computed(() => {
  return (
    isSelectedAccountTypeCredit.value ||
    isSelectedAccountTypeSavings.value ||
    selectedAccountType.value?.accruesBalanceGrowth === true
  );
});

const isSelectedAccountTypeEstimatable = computed(() => {
  const id = selectedAccountType.value?.id;
  return id != null && ESTIMATABLE_ASSET_TYPE_IDS.includes(id);
});
const currentAssetCategory = computed((): AssetEstimateCategory | null => {
  const id = selectedAccountType.value?.id;
  if (id == null) return null;
  return ASSET_TYPE_CATEGORY_MAP[id] ?? null;
});
const isSelectedAccountTypeDepreciatingAsset = computed(() => {
  const id = selectedAccountType.value?.id;
  return id != null && DEPRECIATING_ASSET_TYPE_IDS.includes(id);
});
const isSelectedAccountTypeDepreciatingOrAppreciatingAsset = computed(() => {
  const id = selectedAccountType.value?.id;
  if (id == null) return false;
  return (
    DEPRECIATING_ASSET_TYPE_IDS.includes(id) ||
    APPRECIATING_ASSET_TYPE_IDS.includes(id)
  );
});

const isSelectedAccountTypeCash = computed(
  () => selectedAccountType.value?.type === "cash",
);

const isSelectedAccountTypeCrypto = computed(() =>
  isCryptoAccountType(
    formState.value.typeId,
    listStore.getAccountTypes,
  ),
);

const cryptoChainIds = ref<number[]>([]);

function defaultCryptoChainIds(): number[] {
  const chains = listStore.getEvmChains;
  const defs = chains.filter((c) => c.isDefault).map((c) => c.id);
  if (defs.length > 0) {
    return defs;
  }
  return chains.length > 0 ? [chains[0]!.id] : [];
}

function toggleCryptoChain(chainId: number, checked: boolean) {
  if (checked) {
    if (!cryptoChainIds.value.includes(chainId)) {
      cryptoChainIds.value = [...cryptoChainIds.value, chainId];
    }
  } else {
    cryptoChainIds.value = cryptoChainIds.value.filter((x) => x !== chainId);
  }
}

async function loadCryptoChainsForForm() {
  if (!isSelectedAccountTypeCrypto.value) {
    cryptoChainIds.value = [];
    return;
  }
  if (formState.value.id > 0) {
    try {
      const res = await $api<{ evmChainIds: number[] }>(
        `/api/crypto-register-chains/${formState.value.id}`,
      );
      cryptoChainIds.value =
        res.evmChainIds?.length > 0 ? res.evmChainIds : defaultCryptoChainIds();
    } catch {
      cryptoChainIds.value = defaultCryptoChainIds();
    }
  } else {
    cryptoChainIds.value = defaultCryptoChainIds();
  }
}

const persistedAccountIsCashType = computed(() => {
  const t = listStore.getAccountTypes.find(
    (x) => x.id === props.accountRegister.typeId,
  );
  return t?.type === "cash";
});

const cashCounts = ref<CashDenomCounts>({ ...ZERO_CASH_COUNTS });

const cashCountsDirty = ref(false);

const cashLoading = ref(false);
const activeTab = ref<string | number>("account");

const cashTotal = computed(() =>
  totalDollarsFromCashCounts(cashCounts.value),
);

function resetCashCounts() {
  cashCounts.value = { ...ZERO_CASH_COUNTS };
}

function syncCashBalanceFromCounts() {
  if (!isSelectedAccountTypeCash.value) return;
  if (cashLoading.value) return;
  const t = cashTotal.value;
  if (t > 0) {
    formState.value.balance = t;
    formState.value.latestBalance = t;
    return;
  }
  if (cashCountsDirty.value) {
    formState.value.balance = 0;
    formState.value.latestBalance = 0;
  }
}

function markCashCountsUserEdited() {
  cashCountsDirty.value = true;
}

function bumpCashCount(key: CashDenomKey, delta: number) {
  cashCountsDirty.value = true;
  bumpCashDenomCount(cashCounts, key, delta);
}

function subtotalCash(key: CashDenomKey): number {
  return subtotalForCashDenom(key, cashCounts.value);
}

async function loadCashOnHand(registerId: number) {
  if (!Number.isInteger(registerId) || registerId < 1) return;
  cashLoading.value = true;
  try {
    const res = await $api<{
      ones: number;
      fives: number;
      tens: number;
      twenties: number;
      fifties: number;
      hundreds: number;
    }>(`/api/cash-on-hand/${registerId}`);
    cashCounts.value = {
      ones: res.ones,
      fives: res.fives,
      tens: res.tens,
      twenties: res.twenties,
      fifties: res.fifties,
      hundreds: res.hundreds,
    };
  } catch {
    toast.add({
      color: "error",
      description: "Failed to load cash count.",
    });
  } finally {
    cashLoading.value = false;
  }
}

async function saveCashOnHand(registerId: number) {
  if (!Number.isInteger(registerId) || registerId < 1) return;
  await $api(`/api/cash-on-hand/${registerId}`, {
    method: "PATCH",
    body: { ...cashCounts.value },
  });
}

const showRatesTab = computed(() => {
  if (isSelectedAccountTypeCash.value) return false;
  if (isSelectedAccountTypeCrypto.value) return false;
  return (
    isSelectedAccountTypeCredit.value ||
    isSelectedAccountTypeWithInterest.value ||
    isSelectedAccountTypeChecking.value
  );
});

type AccountRegisterTabItem = {
  label: string;
  value: string;
  icon: string;
  slot: string;
};

const tabItems = computed((): AccountRegisterTabItem[] => {
  const items: AccountRegisterTabItem[] = [
    {
      label: "Account",
      value: "account",
      icon: "i-lucide-wallet",
      slot: "account",
    },
  ];
  if (isSelectedAccountTypeCash.value) {
    items.push({
      label: "Cash Count",
      value: "cash",
      icon: "i-lucide-banknote",
      slot: "cash",
    });
  }
  if (showRatesTab.value) {
    items.push({
      label: "Rates & Loan",
      value: "rates",
      icon: "i-lucide-percent",
      slot: "rates",
    });
  }
  if (
    isSelectedAccountTypeDepreciatingOrAppreciatingAsset.value &&
    !isSelectedAccountTypeCrypto.value
  ) {
    items.push({
      label: "Asset",
      value: "asset",
      icon: "i-lucide-car",
      slot: "asset",
    });
  }
  if (formState.value.id > 0 && !isSelectedAccountTypeCrypto.value) {
    items.push({
      label: "Import",
      value: "import",
      icon: "i-lucide-upload",
      slot: "import",
    });
  }
  return items;
});

watch(
  [cashCounts, isSelectedAccountTypeCash, cashLoading],
  () => {
    syncCashBalanceFromCounts();
  },
  { deep: true },
);

const cashAccountBalanceDisplay = computed(() => {
  if (!isSelectedAccountTypeCash.value) {
    return formatMoneyUsd(formState.value.balance);
  }
  if (cashLoading.value) {
    return formatMoneyUsd(formState.value.balance);
  }
  if (cashTotal.value > 0 || cashCountsDirty.value) {
    return formatMoneyUsd(cashTotal.value);
  }
  return formatMoneyUsd(formState.value.balance);
});

watch([activeTab, tabItems], () => {
  const valid = new Set(
    tabItems.value.map((i) => i.value as string | number),
  );
  if (!valid.has(activeTab.value)) {
    activeTab.value = "account";
  }
});

const assetSectionLabel = computed(() =>
  isSelectedAccountTypeDepreciatingAsset.value ? "Depreciation" : "Appreciation",
);

const estimateSectionTitle = computed(() => {
  const c = currentAssetCategory.value;
  if (c === "vehicle") return "Vehicle details (for AI estimate)";
  if (c === "house") return "House details (for AI estimate)";
  if (c === "boat") return "Boat details (for AI estimate)";
  if (c === "rv") return "RV details (for AI estimate)";
  if (c === "motorcycle") return "Motorcycle details (for AI estimate)";
  return "Asset details (for AI estimate)";
});

const estimateRangeLabel = computed(() => {
  const e = lastAssetEstimate.value;
  if (!e) return "";
  const f = new Intl.NumberFormat(undefined, formatCurrencyOptions);
  return `${f.format(e.estimatedValueLow)} – ${f.format(e.estimatedValueHigh)} (mid ${f.format(e.estimatedValueMid)})`;
});

const depreciationRatePercent = computed({
  get: () => {
    if (formState.value.depreciationRate == null) {
      return null;
    }
    return formState.value.depreciationRate * 100;
  },
  set: (v: number | null) => {
    if (v == null || !Number.isFinite(v)) {
      formState.value.depreciationRate = null;
      return;
    }
    formState.value.depreciationRate = v / 100;
  },
});

const apr1Percent = computed({
  get: () => {
    if (formState.value.apr1 == null) {
      return null;
    }
    return formState.value.apr1 * 100;
  },
  set: (value: number | null) => {
    if (value == null || !Number.isFinite(value)) {
      formState.value.apr1 = null;
      return;
    }
    formState.value.apr1 = value / 100;
  },
});

const apr2Percent = computed({
  get: () => {
    if (formState.value.apr2 == null) {
      return null;
    }
    return formState.value.apr2 * 100;
  },
  set: (value: number | null) => {
    if (value == null || !Number.isFinite(value)) {
      formState.value.apr2 = null;
      return;
    }
    formState.value.apr2 = value / 100;
  },
});

const apr3Percent = computed({
  get: () => {
    if (formState.value.apr3 == null) {
      return null;
    }
    return formState.value.apr3 * 100;
  },
  set: (value: number | null) => {
    if (value == null || !Number.isFinite(value)) {
      formState.value.apr3 = null;
      return;
    }
    formState.value.apr3 = value / 100;
  },
});

const assetStartAtString = computed({
  get: () => {
    return toDateInputString(formState.value.assetStartAt);
  },
  set: (value: string) => {
    formState.value.assetStartAt = value ? new Date(value) : null;
  },
});

const isSelectedAccountTypeGrowthAsset = computed(
  () =>
    !isSelectedAccountTypeCredit.value &&
    !isSelectedAccountTypeSavings.value &&
    selectedAccountType.value?.accruesBalanceGrowth === true,
);

const interestRateLabel = computed(() => {
  if (isSelectedAccountTypeCredit.value) {
    return "APR (%)";
  }
  if (isSelectedAccountTypeSavings.value) {
    return "Interest Rate (%)";
  }
  if (isSelectedAccountTypeGrowthAsset.value) {
    return "Annual Growth Rate (%)";
  }
  return "Interest Rate (%)";
});

const interestRateHint = computed(() => {
  if (isSelectedAccountTypeCredit.value) {
    return "Annual Percentage Rate (0-100%)";
  }
  if (isSelectedAccountTypeSavings.value) {
    return "Annual Interest Rate earned (0-100%)";
  }
  if (isSelectedAccountTypeGrowthAsset.value) {
    return "Expected annual return / appreciation (0-100%)";
  }
  return "Annual Interest Rate (0-100%)";
});

// Convert statementAt Date to string for date input
const statementAtString = computed({
  get: () => {
    return toDateInputString(formState.value.statementAt);
  },
  set: (value: string) => {
    if (value) {
      formState.value.statementAt = new Date(value);
    } else {
      formState.value.statementAt = today.value;
    }
  },
});

const apr1StartAtString = computed({
  get: () => toDateInputString(formState.value.apr1StartAt),
  set: (value: string) => {
    formState.value.apr1StartAt = value ? new Date(value) : null;
  },
});

const apr2StartAtString = computed({
  get: () => toDateInputString(formState.value.apr2StartAt),
  set: (value: string) => {
    formState.value.apr2StartAt = value ? new Date(value) : null;
  },
});

const apr3StartAtString = computed({
  get: () => toDateInputString(formState.value.apr3StartAt),
  set: (value: string) => {
    formState.value.apr3StartAt = value ? new Date(value) : null;
  },
});

const loanStartAtString = computed({
  get: () => toDateInputString(formState.value.loanStartAt),
  set: (value: string) => {
    formState.value.loanStartAt = value ? new Date(value) : null;
  },
});

const loanPaymentsPerYearItems = [
  { id: null, name: "None" },
  { id: 12, name: "12 (Monthly)" },
  { id: 24, name: "24 (Semi-monthly)" },
  { id: 26, name: "26 (Bi-weekly)" },
  { id: 52, name: "52 (Weekly)" },
];

function applyInitialTabFromProps() {
  const want = props.initialTab ?? "account";
  const valid = new Set(
    tabItems.value.map((i) => i.value as string | number),
  );
  activeTab.value = valid.has(want) ? want : "account";
}

function applyPropsToFormAndTab() {
  formState.value = normalizeAccountRegisterState(props.accountRegister);
  syncEstimateDetailLocals(
    formState.value.typeId,
    (props.accountRegister as AccountRegister & { vehicleDetails?: unknown })
      .vehicleDetails,
  );
  lastAssetEstimate.value = null;
  cashCountsDirty.value = false;
  resetCashCounts();
  const t = listStore.getAccountTypes.find(
    (x) => x.id === formState.value.typeId,
  );
  const loadCash =
    t?.type === "cash" &&
    persistedAccountIsCashType.value &&
    formState.value.id > 0;
  if (loadCash) {
    loadCashOnHand(formState.value.id).finally(() => {
      nextTick(applyInitialTabFromProps);
    });
    return;
  }
  void loadCryptoChainsForForm();
  nextTick(applyInitialTabFromProps);
}

watch(
  [() => props.accountRegister, () => props.initialTab],
  applyPropsToFormAndTab,
  { deep: true, immediate: true },
);

watchEffect(() => {
  const tid = formState.value.typeId;
  const cat = ASSET_TYPE_CATEGORY_MAP[tid];
  const fs = formState.value as AccountRegister & { vehicleDetails?: unknown };
  if (cat === "vehicle") {
    fs.vehicleDetails = { category: "vehicle", ...vehicleDetailsLocal };
  } else if (cat === "house") {
    fs.vehicleDetails = { category: "house", ...houseDetailsLocal };
  } else if (cat === "boat") {
    fs.vehicleDetails = { category: "boat", ...boatDetailsLocal };
  } else if (cat === "rv") {
    fs.vehicleDetails = { category: "rv", ...rvDetailsLocal };
  } else if (cat === "motorcycle") {
    fs.vehicleDetails = { category: "motorcycle", ...motorcycleDetailsLocal };
  } else {
    fs.vehicleDetails = { ...vehicleDetailsLocal };
  }
});

const vehicleConditionItems = [
  { id: "excellent", name: "Excellent" },
  { id: "good", name: "Good" },
  { id: "fair", name: "Fair" },
  { id: "poor", name: "Poor" },
];

const propertyTypeItems = [
  { id: "single-family", name: "Single-family" },
  { id: "condo", name: "Condo" },
  { id: "townhouse", name: "Townhouse" },
  { id: "multi-family", name: "Multi-family" },
];

const boatEngineTypeItems = [
  { id: "outboard", name: "Outboard" },
  { id: "inboard", name: "Inboard" },
  { id: "sail", name: "Sail" },
  { id: "jet", name: "Jet" },
];

const rvClassItems = [
  { id: "class-a", name: "Class A" },
  { id: "class-b", name: "Class B" },
  { id: "class-c", name: "Class C" },
  { id: "travel-trailer", name: "Travel trailer" },
  { id: "fifth-wheel", name: "Fifth wheel" },
];

async function runAssetEstimate() {
  const cat = currentAssetCategory.value;
  if (!cat) return;

  if (cat === "vehicle") {
    if (!vehicleDetailsLocal.make.trim() || !vehicleDetailsLocal.model.trim()) {
      toast.add({
        color: "error",
        description: "Make and model are required to estimate.",
      });
      return;
    }
  } else if (cat === "house") {
    if (houseDetailsLocal.zip.trim().length !== 5) {
      toast.add({
        color: "error",
        description: "A valid 5-digit ZIP is required to estimate.",
      });
      return;
    }
  } else if (cat === "boat") {
    if (!boatDetailsLocal.make.trim() || !boatDetailsLocal.model.trim()) {
      toast.add({
        color: "error",
        description: "Make and model are required to estimate.",
      });
      return;
    }
  } else if (cat === "rv") {
    if (!rvDetailsLocal.make.trim() || !rvDetailsLocal.model.trim()) {
      toast.add({
        color: "error",
        description: "Make and model are required to estimate.",
      });
      return;
    }
  } else if (cat === "motorcycle") {
    if (!motorcycleDetailsLocal.make.trim() || !motorcycleDetailsLocal.model.trim()) {
      toast.add({
        color: "error",
        description: "Make and model are required to estimate.",
      });
      return;
    }
  }

  isEstimatingAsset.value = true;
  lastAssetEstimate.value = null;
  try {
    const base: Record<string, unknown> = {
      category: cat,
      accountId: formState.value.accountId,
    };
    if (formState.value.id > 0) {
      base.accountRegisterId = formState.value.id;
    }

    let body: Record<string, unknown> = base;

    if (cat === "vehicle") {
      body = {
        ...base,
        year: vehicleDetailsLocal.year,
        make: vehicleDetailsLocal.make.trim(),
        model: vehicleDetailsLocal.model.trim(),
        mileage: vehicleDetailsLocal.mileage,
        condition: vehicleDetailsLocal.condition,
      };
      const trim = vehicleDetailsLocal.trim.trim();
      if (trim) body.trim = trim;
      const zip = vehicleDetailsLocal.zip.trim();
      if (zip) body.zip = zip;
      const vin = vehicleDetailsLocal.vinLast4.trim();
      if (vin) body.vinLast4 = vin;
      if (
        vehicleDetailsLocal.purchasePriceHint != null &&
        Number.isFinite(vehicleDetailsLocal.purchasePriceHint)
      ) {
        body.purchasePriceHint = vehicleDetailsLocal.purchasePriceHint;
      }
    } else if (cat === "house") {
      body = {
        ...base,
        bedrooms: houseDetailsLocal.bedrooms,
        bathrooms: houseDetailsLocal.bathrooms,
        squareFootage: houseDetailsLocal.squareFootage,
        yearBuilt: houseDetailsLocal.yearBuilt,
        zip: houseDetailsLocal.zip.trim(),
        propertyType: houseDetailsLocal.propertyType,
        condition: houseDetailsLocal.condition,
      };
      if (
        houseDetailsLocal.lotSizeAcres != null &&
        Number.isFinite(houseDetailsLocal.lotSizeAcres)
      ) {
        body.lotSizeAcres = houseDetailsLocal.lotSizeAcres;
      }
      if (
        houseDetailsLocal.purchasePriceHint != null &&
        Number.isFinite(houseDetailsLocal.purchasePriceHint)
      ) {
        body.purchasePriceHint = houseDetailsLocal.purchasePriceHint;
      }
    } else if (cat === "boat") {
      body = {
        ...base,
        year: boatDetailsLocal.year,
        make: boatDetailsLocal.make.trim(),
        model: boatDetailsLocal.model.trim(),
        lengthFeet: boatDetailsLocal.lengthFeet,
        engineType: boatDetailsLocal.engineType,
        condition: boatDetailsLocal.condition,
      };
      const z = boatDetailsLocal.zip.trim();
      if (z) body.zip = z;
      if (
        boatDetailsLocal.engineHours != null &&
        Number.isFinite(boatDetailsLocal.engineHours)
      ) {
        body.engineHours = boatDetailsLocal.engineHours;
      }
      if (
        boatDetailsLocal.purchasePriceHint != null &&
        Number.isFinite(boatDetailsLocal.purchasePriceHint)
      ) {
        body.purchasePriceHint = boatDetailsLocal.purchasePriceHint;
      }
    } else if (cat === "rv") {
      body = {
        ...base,
        year: rvDetailsLocal.year,
        make: rvDetailsLocal.make.trim(),
        model: rvDetailsLocal.model.trim(),
        rvClass: rvDetailsLocal.rvClass,
        lengthFeet: rvDetailsLocal.lengthFeet,
        mileage: rvDetailsLocal.mileage,
        condition: rvDetailsLocal.condition,
      };
      const z = rvDetailsLocal.zip.trim();
      if (z) body.zip = z;
      if (
        rvDetailsLocal.purchasePriceHint != null &&
        Number.isFinite(rvDetailsLocal.purchasePriceHint)
      ) {
        body.purchasePriceHint = rvDetailsLocal.purchasePriceHint;
      }
    } else if (cat === "motorcycle") {
      body = {
        ...base,
        year: motorcycleDetailsLocal.year,
        make: motorcycleDetailsLocal.make.trim(),
        model: motorcycleDetailsLocal.model.trim(),
        mileage: motorcycleDetailsLocal.mileage,
        condition: motorcycleDetailsLocal.condition,
      };
      const z = motorcycleDetailsLocal.zip.trim();
      if (z) body.zip = z;
      if (
        motorcycleDetailsLocal.engineCC != null &&
        Number.isFinite(motorcycleDetailsLocal.engineCC)
      ) {
        body.engineCC = motorcycleDetailsLocal.engineCC;
      }
      if (
        motorcycleDetailsLocal.purchasePriceHint != null &&
        Number.isFinite(motorcycleDetailsLocal.purchasePriceHint)
      ) {
        body.purchasePriceHint = motorcycleDetailsLocal.purchasePriceHint;
      }
    }

    const res = await $api<{ estimate: VehicleEstimateResult }>(
      "/api/asset-value-estimate",
      { method: "POST", body },
    );
    lastAssetEstimate.value = vehicleValueEstimateAiResultSchema.parse(
      res.estimate,
    );
    toast.add({
      color: "success",
      description:
        "Estimate received. Review the range, then apply to balance or original value if you want.",
    });
  } catch (e) {
    handleError(e, toast);
  } finally {
    isEstimatingAsset.value = false;
  }
}

function applyEstimateToBalance() {
  const e = lastAssetEstimate.value;
  if (!e) return;
  const v = Math.round(e.estimatedValueMid * 100) / 100;
  formState.value.balance = v;
  formState.value.latestBalance = v;
  toast.add({
    color: "success",
    description: "Balance updated using the mid estimate.",
  });
}

function applyEstimateToOriginal() {
  const e = lastAssetEstimate.value;
  if (!e) return;
  const v = Math.round(e.estimatedValueMid * 100) / 100;
  formState.value.assetOriginalValue = v;
  toast.add({
    color: "success",
    description: "Asset original value updated using the mid estimate.",
  });
}

watch(
  () => formState.value.typeId,
  (newTypeId, oldTypeId) => {
    if (!isSelectedAccountTypeCredit.value) {
      formState.value.collateralAssetRegisterId = null;
      formState.value.targetAccountRegisterId = null;
      formState.value.paymentCategoryId = null;
    }

    const previousType = listStore.getAccountTypes.find(
      (type) => type.id === oldTypeId,
    );
    const wasMortgage = previousType?.type === "mortgage";
    if (wasMortgage && !isSelectedAccountTypeMortgage.value) {
      formState.value.apr2 = null;
      formState.value.apr2StartAt = null;
      formState.value.apr3 = null;
      formState.value.apr3StartAt = null;
      formState.value.loanStartAt = null;
      formState.value.loanPaymentsPerYear = null;
      formState.value.loanTotalYears = null;
      formState.value.loanOriginalAmount = null;
      formState.value.allowExtraPayment = false;
    }

    const previousWasCash = previousType?.type === "cash";
    const newType = listStore.getAccountTypes.find((t) => t.id === newTypeId);
    if (previousWasCash && newType?.type !== "cash") {
      activeTab.value = "account";
    }

    if (newType?.type === "cash") {
      if (formState.value.id > 0 && persistedAccountIsCashType.value) {
        void loadCashOnHand(formState.value.id);
      } else {
        cashCountsDirty.value = false;
        resetCashCounts();
        syncCashBalanceFromCounts();
      }
    }

    if (newType?.registerClass === "crypto") {
      void loadCryptoChainsForForm();
    } else {
      cryptoChainIds.value = [];
    }

    const oldEstCat = ASSET_TYPE_CATEGORY_MAP[oldTypeId];
    const newEstCat = ASSET_TYPE_CATEGORY_MAP[newTypeId];
    if (oldEstCat !== newEstCat) {
      if (newEstCat === "vehicle") {
        Object.assign(vehicleDetailsLocal, defaultVehicleDetails());
      } else if (newEstCat === "house") {
        Object.assign(houseDetailsLocal, defaultHouseDetails());
      } else if (newEstCat === "boat") {
        Object.assign(boatDetailsLocal, defaultBoatDetails());
      } else if (newEstCat === "rv") {
        Object.assign(rvDetailsLocal, defaultRvDetails());
      } else if (newEstCat === "motorcycle") {
        Object.assign(motorcycleDetailsLocal, defaultMotorcycleDetails());
      }
    }
  },
);

const categorySelectItemsForRegister = computed(() => {
  const base = [{ id: null, name: "None", value: null, label: "None" }] as {
    id: string | null;
    name: string;
    value: string | null;
    label: string;
  }[];
  return [
    ...base,
    ...buildSortedCategorySelectItems(
      listStore.getCategories,
      formState.value.accountId,
    ),
  ];
});

/** Checking/savings/etc. registers that can fund loan or card payments (same account, top-level, non-credit). */
const loanPaymentSourceSelectItems = computed(() => {
  const items: { id: number | null; name: string }[] = [
    { id: null, name: "None" },
  ];
  for (const r of listStore.getAccountRegisters) {
    if (r.id === formState.value.id) continue;
    if (r.accountId !== formState.value.accountId) continue;
    if (r.subAccountRegisterId) continue;
    const t = listStore.getAccountTypes.find((x) => x.id === r.typeId);
    if (t?.isCredit) continue;
    if (t?.registerClass === "crypto") continue;
    items.push({ id: r.id, name: r.name });
  }
  return items;
});

const collateralAssetSelectItems = computed(() => {
  const taken = new Set(
    listStore.getAccountRegisters
      .filter(
        (r) =>
          r.collateralAssetRegisterId != null && r.id !== formState.value.id,
      )
      .map((r) => r.collateralAssetRegisterId as number),
  );
  const items: { id: number | null; name: string }[] = [
    { id: null, name: "None" },
  ];
  for (const r of listStore.getAccountRegisters) {
    if (r.id === formState.value.id) continue;
    if (r.accountId !== formState.value.accountId) continue;
    if (r.subAccountRegisterId) continue;
    const t = listStore.getAccountTypes.find((x) => x.id === r.typeId);
    if (t?.isCredit) continue;
    if (t?.registerClass === "crypto") continue;
    if (taken.has(r.id) && formState.value.collateralAssetRegisterId !== r.id) {
      continue;
    }
    items.push({ id: r.id, name: r.name });
  }
  return items;
});

/** Master account options for Pocket (type 15); include current parent if filtered out of `formatAccountRegisters`. */
const pocketParentRegisterSelectItems = computed((): AccountRegister[] => {
  const regs = listStore.getAccountRegisters;
  const base = formatAccountRegisters(regs).filter(
    (register) =>
      register.typeId !== 15 && register.id !== formState.value.id,
  );
  const sid = formState.value.subAccountRegisterId;
  if (sid == null || sid < 1) return base;
  if (base.some((r) => r.id === sid)) return base;
  const parent = regs.find((r) => r.id === sid);
  if (!parent) return base;
  return [...base, { ...parent }];
});

function accountRegisterSubmitErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "An error occurred during account register update.";
}

async function uploadRegisterCsvIfAny(
  input: { inputRef?: HTMLInputElement | null } | null | undefined,
  accountRegisterId: number,
): Promise<void> {
  const el = input?.inputRef;
  const file = el?.files?.[0];
  if (file === undefined) return;
  const fileInputData = new FormData();
  fileInputData.append("fileData", file);
  fileInputData.append("accountRegisterId", String(accountRegisterId));
  await $api("/api/upload-file", {
    method: "POST",
    body: fileInputData,
  });
}

async function handleSubmit({
  data: formData,
}: FormSubmitEvent<AccountRegister>) {
  const blockCashWhileLoading =
    isSelectedAccountTypeCash.value &&
    formState.value.id > 0 &&
    cashLoading.value;
  if (blockCashWhileLoading) {
    return;
  }

  try {
    isSaving.value = true;

    if (isSelectedAccountTypeCrypto.value) {
      if (!cryptoChainIds.value.length) {
        toast.add({
          color: "error",
          description: "Select at least one EVM chain.",
        });
        isSaving.value = false;
        return;
      }
      if (!formState.value.walletAddress?.trim()) {
        toast.add({
          color: "error",
          description: "Enter a wallet address.",
        });
        isSaving.value = false;
        return;
      }
    }

    const cashUseBillTotal =
      isSelectedAccountTypeCash.value &&
      (cashCountsDirty.value || cashTotal.value > 0);

    await uploadRegisterCsvIfAny(fileInput?.value, formData.id);

    let balanceForPayload = formData.balance;
    if (isSelectedAccountTypeCash.value && cashUseBillTotal) {
      balanceForPayload = cashTotal.value;
    }
    const payload = {
      ...formData,
      balance: balanceForPayload,
      latestBalance: balanceForPayload,
      ...(isSelectedAccountTypeCrypto.value
        ? {
            walletAddress: formState.value.walletAddress ?? null,
            selectedChainIds: cryptoChainIds.value,
          }
        : {}),
    };
    const responseData = await $api("/api/account-register", {
      method: "POST",
      body: payload,
      onResponseError: () => {
        isSaving.value = false;
      },
    }).catch((error) => handleError(error, toast));

    if (responseData) {
      formState.value = accountRegisterSchema.parse(responseData);
      props.callback(formState.value);

      const persistCashCounts =
        isSelectedAccountTypeCash.value &&
        formState.value.id > 0 &&
        cashUseBillTotal;
      if (persistCashCounts) {
        try {
          await saveCashOnHand(formState.value.id);
        } catch (e) {
          handleError(e, toast);
          isSaving.value = false;
          return;
        }
      }

      toast.add({
        color: "success",
        description: "Updated account register successfully.",
      });
      isSaving.value = false;
      props.cancel();
      return;
    }

    isSaving.value = false;
    toast.add({
      color: "error",
      description: "Failed to update account register.",
    });
  } catch (error) {
    toast.add({
      color: "error",
      description: accountRegisterSubmitErrorMessage(error),
    });
  }
  isSaving.value = false;
}

async function archiveAccountRegister() {
  isDeleting.value = true;
  const result = await $api("/api/account-register", {
    method: "DELETE",
    params: { accountRegisterId: formState.value.id },
    onResponseError: () => {
      isDeleting.value = false;
    },
  }).catch((error) => handleError(error, toast));

  if (result) {
    toast.add({
      color: "success",
      description: "Account archived. It will no longer appear in lists or dropdowns.",
    });

    await listStore.fetchLists();
    isDeleting.value = false;
    showArchiveConfirm.value = false;
    props.cancel();
  } else {
    isSaving.value = false;
    showArchiveConfirm.value = false;
    toast.add({
      color: "error",
      description: "Failed to archive account register.",
    });
    isDeleting.value = false;
  }
}

function confirmArchive() {
  showArchiveConfirm.value = true;
}

function cancelArchiveConfirmation() {
  showArchiveConfirm.value = false;
}

function triggerPrimaryAction() {
  if (isSaving.value || isDeleting.value || showArchiveConfirm.value) return;
  if (
    isSelectedAccountTypeCash.value &&
    formState.value.id > 0 &&
    cashLoading.value
  ) {
    return;
  }
  form.value?.submit?.();
}

defineShortcuts({
  enter: () => triggerPrimaryAction(),
  escape: () => {
    if (isSaving.value || isDeleting.value) return;
    if (showArchiveConfirm.value) {
      cancelArchiveConfirmation();
      return;
    }
    props.cancel();
  },
});
</script>

<template lang="pug">
UModal(:title="props.title" :description="props.description || props.title" class="modal-mobile-fullscreen")
  template(#body)
    UForm(class="space-y-4" @submit.prevent="handleSubmit" :schema="accountRegisterSchema" :state="formState" @error="handleError($event, toast)" :disabled="isSaving || isDeleting || (isSelectedAccountTypeCash && formState.id > 0 && cashLoading)" ref="form")
      UTabs(v-model="activeTab" :items="tabItems" variant="link" class="w-full" :unmount-on-hide="false")
        template(#account)
          div(class="space-y-4 pt-2")
            .flex.space-x-4
              UFormField(label="Budget" name="budgetId" class="flex-1")
                USelect(v-model="formState.budgetId"
                  class="w-full"
                  placeholder="Select a Budget"
                  :items="listStore.getBudgets"
                  valueKey="id"
                  labelKey="name")

              UFormField(label="Type" name="typeId" class="flex-1")
                USelect(v-model="formState.typeId"
                  class="w-full"
                  placeholder="Select a Type"
                  :items="listStore.getAccountTypes.map(i => ({ id: i.id, name: i.name }))"
                  valueKey="id"
                  labelKey="name")

            UFormField(label="Sub Account" name="subAccountRegisterId" v-if="formState.typeId === 15")
              USelect(v-model="formState.subAccountRegisterId"
                class="w-full"
                placeholder="Select a Sub Account"
                :items="pocketParentRegisterSelectItems"
                valueKey="id"
                labelKey="name")

            UFormField(label="Name" name="name")
              UInput(v-model="formState.name" type="text" id="name" class="w-full")

            template(v-if="isSelectedAccountTypeCrypto")
              UFormField(label="Wallet address" name="walletAddress")
                UInput(v-model="formState.walletAddress" type="text" class="w-full" placeholder="0x…" autocomplete="off")
              div(class="space-y-2")
                p(class="text-sm text-muted") Chains to include
                div(
                  v-for="c in listStore.getEvmChains"
                  :key="c.id"
                  class="flex items-center gap-2"
                )
                  UCheckbox(
                    :model-value="cryptoChainIds.includes(c.id)"
                    @update:model-value="(v: boolean) => toggleCryptoChain(c.id, Boolean(v))"
                    :label="`${c.name} (${c.symbol})`"
                  )
              UFormField(v-if="formState.id > 0" label="Portfolio value (USD)" hint="Updated from on-chain sync")
                UInput(
                  :model-value="formatMoneyUsd(formState.balance)"
                  type="text"
                  readonly
                  disabled
                  class="w-full"
                )

            template(v-if="isSelectedAccountTypeCash")
              UFormField(label="Account balance" name="balance" hint="Total from bill counts on the Cash Count tab")
                UInput(
                  :model-value="cashAccountBalanceDisplay"
                  type="text"
                  readonly
                  disabled
                  class="w-full"
                )

            template(v-else-if="!isSelectedAccountTypeCrypto")
              UFormField(label="Account Balance" name="balance")
                UInputNumber(
                  v-model="formState.balance"
                  :format-options="formatCurrencyOptions"
                  :step="0.01"
                  id="balance" class="w-full")

        template(#cash)
          div(class="space-y-4 pt-2")
            div(v-if="cashLoading" class="text-muted") Loading cash count…
            template(v-else)
              div(class="text-center py-3 border-b border-default mb-2")
                p(class="text-sm text-muted mb-1") Total (from bills)
                p(class="text-2xl font-bold tabular-nums frog-text") {{ formatMoneyUsd(cashTotal) }}
              div(
                v-for="d in CASH_DENOM_CONFIG"
                :key="d.key"
                class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              )
                span(class="font-medium shrink-0 w-12") {{ d.label }}
                div(class="flex items-center gap-2 flex-1 justify-end")
                  UButton(
                    color="neutral"
                    variant="soft"
                    size="sm"
                    :disabled="isSaving || isDeleting || cashLoading"
                    @click="bumpCashCount(d.key, -1)"
                    aria-label="Decrease"
                  )
                    UIcon(name="i-lucide-minus" class="w-4 h-4")
                  UInputNumber(
                    v-model="cashCounts[d.key]"
                    :min="0"
                    :step="1"
                    class="w-24"
                    :disabled="isSaving || isDeleting || cashLoading"
                    @update:model-value="markCashCountsUserEdited"
                  )
                  UButton(
                    color="neutral"
                    variant="soft"
                    size="sm"
                    :disabled="isSaving || isDeleting || cashLoading"
                    @click="bumpCashCount(d.key, 1)"
                    aria-label="Increase"
                  )
                    UIcon(name="i-lucide-plus" class="w-4 h-4")
                span(class="text-right text-muted tabular-nums sm:w-28") {{ formatMoneyUsd(subtotalCash(d.key)) }}

        template(#rates)
          div(class="space-y-4 pt-2")
            UFormField(label="Min Payment" name="minPayment" v-if="isSelectedAccountTypeCredit")
              UInputNumber(
                v-model="formState.minPayment"
                :format-options="formatCurrencyOptions"
                :step="0.01"
                class="w-full")

            UFormField(
              label="Pay from account"
              name="targetAccountRegisterId"
              v-if="isSelectedAccountTypeCredit"
              hint="Optional. The account (e.g. checking) used for minimum and forecasted loan or card payments."
            )
              USelect(
                v-model="formState.targetAccountRegisterId"
                class="w-full"
                placeholder="None"
                :items="loanPaymentSourceSelectItems"
                valueKey="id"
                labelKey="name")

            UFormField(
              label="Linked asset (collateral)"
              name="collateralAssetRegisterId"
              v-if="isSelectedAccountTypeCredit"
              hint="Optional. Pair this loan with an asset (e.g. home) for net equity on Accounts."
            )
              USelect(
                v-model="formState.collateralAssetRegisterId"
                class="w-full"
                placeholder="None"
                :items="collateralAssetSelectItems"
                valueKey="id"
                labelKey="name")

            UFormField(label="Statement Date" name="statementAt" v-if="isSelectedAccountTypeWithInterest")
              UInput(
                v-model="statementAtString"
                type="date"
                class="w-full")

            UFormField(label="Statement Interval" name="statementIntervalId" v-if="isSelectedAccountTypeWithInterest")
              USelect(v-model="formState.statementIntervalId"
                class="w-full"
                placeholder="Select a Statement Interval"
                :items="listStore.getIntervals.map(i => ({ id: i.id, name: i.name }))"
                valueKey="id"
                labelKey="name")

            UFormField(:label="interestRateLabel" name="apr1" v-if="isSelectedAccountTypeWithInterest" :hint="interestRateHint")
              div(class="relative")
                UInputNumber(
                  v-model="apr1Percent"
                  :format-options="{ style: 'decimal', minimumFractionDigits: 1, maximumFractionDigits: 3 }"
                  :step="0.001"
                  :min="0"
                  :max="100"
                  class="w-full")

            div(v-if="isSelectedAccountTypeMortgage" class="space-y-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800")
              h3(class="text-sm font-semibold text-indigo-700 dark:text-indigo-300 mb-2") Mortgage details

              UFormField(label="APR 1 start date" name="apr1StartAt" hint="Optional date when APR 1 schedule starts")
                UInput(
                  v-model="apr1StartAtString"
                  type="date"
                  class="w-full")

              div(class="grid grid-cols-1 md:grid-cols-2 gap-3")
                UFormField(label="APR 2 (%)" name="apr2" hint="Optional future APR")
                  UInputNumber(
                    v-model="apr2Percent"
                    :format-options="{ style: 'decimal', minimumFractionDigits: 1, maximumFractionDigits: 3 }"
                    :step="0.001"
                    :min="0"
                    :max="100"
                    class="w-full")
                UFormField(label="APR 2 start date" name="apr2StartAt")
                  UInput(
                    v-model="apr2StartAtString"
                    type="date"
                    class="w-full")

              div(class="grid grid-cols-1 md:grid-cols-2 gap-3")
                UFormField(label="APR 3 (%)" name="apr3" hint="Optional additional APR tier")
                  UInputNumber(
                    v-model="apr3Percent"
                    :format-options="{ style: 'decimal', minimumFractionDigits: 1, maximumFractionDigits: 3 }"
                    :step="0.001"
                    :min="0"
                    :max="100"
                    class="w-full")
                UFormField(label="APR 3 start date" name="apr3StartAt")
                  UInput(
                    v-model="apr3StartAtString"
                    type="date"
                    class="w-full")

              UFormField(label="Loan start date" name="loanStartAt" hint="Optional origination / amortization start date")
                UInput(
                  v-model="loanStartAtString"
                  type="date"
                  class="w-full")

              UFormField(label="Original loan amount" name="loanOriginalAmount")
                UInputNumber(
                  v-model="formState.loanOriginalAmount"
                  :format-options="formatCurrencyOptions"
                  :step="0.01"
                  class="w-full")

              div(class="grid grid-cols-1 md:grid-cols-2 gap-3")
                UFormField(label="Loan term (years)" name="loanTotalYears")
                  UInputNumber(
                    v-model="formState.loanTotalYears"
                    :step="1"
                    :min="1"
                    :max="100"
                    class="w-full")
                UFormField(label="Payments per year" name="loanPaymentsPerYear")
                  USelect(
                    v-model="formState.loanPaymentsPerYear"
                    class="w-full"
                    :items="loanPaymentsPerYearItems"
                    valueKey="id"
                    labelKey="name"
                    placeholder="None")

              UFormField(label="Allow extra payment" name="allowExtraPayment" hint="When enabled, forecast can pay more than the minimum payment")
                .flex.items-center(class="h-8")
                  USwitch(v-model="formState.allowExtraPayment")

            UFormField(label="Interest category" name="interestCategoryId" v-if="isSelectedAccountTypeWithInterest")
              USelectMenu(
                v-model="formState.interestCategoryId"
                class="w-full"
                :items="categorySelectItemsForRegister"
                value-key="value"
                label-key="label"
                :filter-fields="['label', 'name']"
                placeholder="None")

            UFormField(label="Payment category" name="paymentCategoryId" v-if="isSelectedAccountTypeCredit")
              USelectMenu(
                v-model="formState.paymentCategoryId"
                class="w-full"
                :items="categorySelectItemsForRegister"
                value-key="value"
                label-key="label"
                :filter-fields="['label', 'name']"
                placeholder="None")

            UFormField(label="Min Account Balance" name="minAccountBalance" v-if="isSelectedAccountTypeChecking" hint="before paying down extra debt")
              UInputNumber(
                v-model="formState.minAccountBalance"
                :format-options="formatCurrencyOptions"
                :step="0.01"
                class="w-full")

            div(v-if="isSelectedAccountTypeSavings" class="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800")
              h3(class="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2") Savings Goal Settings

              UFormField(label="Savings Goal Amount" name="accountSavingsGoal" hint="target amount to save")
                UInputNumber(
                  v-model="formState.accountSavingsGoal"
                  :format-options="formatCurrencyOptions"
                  :step="0.01"
                  class="w-full")

        template(#asset)
          div(class="space-y-4 pt-2")
            div(v-if="isSelectedAccountTypeDepreciatingOrAppreciatingAsset" class="space-y-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800")
              h3(class="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2") {{ assetSectionLabel }} Settings

              UFormField(:label="assetSectionLabel + ' Rate (%)'" name="depreciationRate" :hint="assetSectionLabel === 'Depreciation' ? 'Annual depreciation rate (0–100%)' : 'Annual appreciation rate (0–100%)'")
                UInputNumber(
                  v-model="depreciationRatePercent"
                  :format-options="{ style: 'decimal', minimumFractionDigits: 1, maximumFractionDigits: 2 }"
                  :step="0.1"
                  :min="0"
                  :max="100"
                  class="w-full")

              UFormField(label="Method" name="depreciationMethod" v-if="isSelectedAccountTypeDepreciatingAsset" hint="declining-balance, straight-line, or compound")
                USelect(
                  v-model="formState.depreciationMethod"
                  class="w-full"
                  placeholder="Default (declining-balance)"
                  :items="[{ id: null, name: 'Default (declining-balance)' }, { id: 'declining-balance', name: 'Declining balance' }, { id: 'straight-line', name: 'Straight-line' }, { id: 'compound', name: 'Compound' }]"
                  valueKey="id"
                  labelKey="name")

              UFormField(label="Residual value (floor)" name="assetResidualValue" hint="Optional minimum value")
                UInputNumber(
                  v-model="formState.assetResidualValue"
                  :format-options="formatCurrencyOptions"
                  :step="0.01"
                  class="w-full")

              UFormField(label="Useful life (years)" name="assetUsefulLifeYears" v-if="isSelectedAccountTypeDepreciatingAsset" hint="For straight-line method")
                UInputNumber(
                  v-model="formState.assetUsefulLifeYears"
                  :step="1"
                  :min="1"
                  :max="100"
                  class="w-full")

              UFormField(label="Start date" name="assetStartAt" hint="When depreciation/appreciation begins (default: statement date)")
                UInput(
                  v-model="assetStartAtString"
                  type="date"
                  class="w-full")

            div(v-if="isSelectedAccountTypeEstimatable" class="space-y-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800")
              h3(class="text-sm font-semibold text-emerald-800 dark:text-emerald-200 mb-2") {{ estimateSectionTitle }}

              p(class="text-xs text-emerald-900/80 dark:text-emerald-200/90 mb-2") Illustrative only — not an appraisal or licensed guidebook value. Estimates are logged for admins under OpenAI request logs.

              template(v-if="currentAssetCategory === 'vehicle'")
                div(class="grid grid-cols-1 sm:grid-cols-2 gap-3")
                  UFormField(label="Year")
                    UInputNumber(v-model="vehicleDetailsLocal.year" :min="1900" :max="2100" :step="1" class="w-full")
                  UFormField(label="ZIP (optional)" hint="5-digit US")
                    UInput(v-model="vehicleDetailsLocal.zip" type="text" maxlength="5" class="w-full")
                UFormField(label="Make")
                  UInput(v-model="vehicleDetailsLocal.make" type="text" class="w-full")
                UFormField(label="Model")
                  UInput(v-model="vehicleDetailsLocal.model" type="text" class="w-full")
                UFormField(label="Trim (optional)")
                  UInput(v-model="vehicleDetailsLocal.trim" type="text" class="w-full")
                div(class="grid grid-cols-1 sm:grid-cols-2 gap-3")
                  UFormField(label="Mileage")
                    UInputNumber(v-model="vehicleDetailsLocal.mileage" :min="0" :step="1" class="w-full")
                  UFormField(label="Condition")
                    USelect(
                      v-model="vehicleDetailsLocal.condition"
                      class="w-full"
                      :items="vehicleConditionItems"
                      valueKey="id"
                      labelKey="name")
                div(class="grid grid-cols-1 sm:grid-cols-2 gap-3")
                  UFormField(label="VIN last 4 (optional)")
                    UInput(v-model="vehicleDetailsLocal.vinLast4" type="text" maxlength="4" class="w-full")
                  UFormField(label="Purchase / MSRP hint (optional)")
                    UInputNumber(
                      v-model="vehicleDetailsLocal.purchasePriceHint"
                      :format-options="formatCurrencyOptions"
                      :step="0.01"
                      class="w-full")

              template(v-else-if="currentAssetCategory === 'house'")
                div(class="grid grid-cols-1 sm:grid-cols-2 gap-3")
                  UFormField(label="Bedrooms")
                    UInputNumber(v-model="houseDetailsLocal.bedrooms" :min="0" :step="0.5" class="w-full")
                  UFormField(label="Bathrooms")
                    UInputNumber(v-model="houseDetailsLocal.bathrooms" :min="0" :step="0.25" class="w-full")
                div(class="grid grid-cols-1 sm:grid-cols-2 gap-3")
                  UFormField(label="Square footage")
                    UInputNumber(v-model="houseDetailsLocal.squareFootage" :min="1" :step="1" class="w-full")
                  UFormField(label="Year built")
                    UInputNumber(v-model="houseDetailsLocal.yearBuilt" :min="1800" :max="2100" :step="1" class="w-full")
                UFormField(label="ZIP" hint="5-digit US (required for estimate)")
                  UInput(v-model="houseDetailsLocal.zip" type="text" maxlength="5" class="w-full")
                UFormField(label="Property type")
                  USelect(
                    v-model="houseDetailsLocal.propertyType"
                    class="w-full"
                    :items="propertyTypeItems"
                    valueKey="id"
                    labelKey="name")
                UFormField(label="Lot size (acres, optional)")
                  UInputNumber(v-model="houseDetailsLocal.lotSizeAcres" :min="0" :step="0.01" class="w-full")
                UFormField(label="Condition")
                  USelect(
                    v-model="houseDetailsLocal.condition"
                    class="w-full"
                    :items="vehicleConditionItems"
                    valueKey="id"
                    labelKey="name")
                UFormField(label="Purchase / value hint (optional)")
                  UInputNumber(
                    v-model="houseDetailsLocal.purchasePriceHint"
                    :format-options="formatCurrencyOptions"
                    :step="0.01"
                    class="w-full")

              template(v-else-if="currentAssetCategory === 'boat'")
                div(class="grid grid-cols-1 sm:grid-cols-2 gap-3")
                  UFormField(label="Year")
                    UInputNumber(v-model="boatDetailsLocal.year" :min="1900" :max="2100" :step="1" class="w-full")
                  UFormField(label="Length (ft)")
                    UInputNumber(v-model="boatDetailsLocal.lengthFeet" :min="0.1" :step="0.5" class="w-full")
                UFormField(label="Make")
                  UInput(v-model="boatDetailsLocal.make" type="text" class="w-full")
                UFormField(label="Model")
                  UInput(v-model="boatDetailsLocal.model" type="text" class="w-full")
                UFormField(label="Engine type")
                  USelect(
                    v-model="boatDetailsLocal.engineType"
                    class="w-full"
                    :items="boatEngineTypeItems"
                    valueKey="id"
                    labelKey="name")
                div(class="grid grid-cols-1 sm:grid-cols-2 gap-3")
                  UFormField(label="Engine hours (optional)")
                    UInputNumber(v-model="boatDetailsLocal.engineHours" :min="0" :step="1" class="w-full")
                  UFormField(label="ZIP (optional)" hint="5-digit US")
                    UInput(v-model="boatDetailsLocal.zip" type="text" maxlength="5" class="w-full")
                UFormField(label="Condition")
                  USelect(
                    v-model="boatDetailsLocal.condition"
                    class="w-full"
                    :items="vehicleConditionItems"
                    valueKey="id"
                    labelKey="name")
                UFormField(label="Purchase hint (optional)")
                  UInputNumber(
                    v-model="boatDetailsLocal.purchasePriceHint"
                    :format-options="formatCurrencyOptions"
                    :step="0.01"
                    class="w-full")

              template(v-else-if="currentAssetCategory === 'rv'")
                div(class="grid grid-cols-1 sm:grid-cols-2 gap-3")
                  UFormField(label="Year")
                    UInputNumber(v-model="rvDetailsLocal.year" :min="1900" :max="2100" :step="1" class="w-full")
                  UFormField(label="Length (ft)")
                    UInputNumber(v-model="rvDetailsLocal.lengthFeet" :min="0.1" :step="0.5" class="w-full")
                UFormField(label="Make")
                  UInput(v-model="rvDetailsLocal.make" type="text" class="w-full")
                UFormField(label="Model")
                  UInput(v-model="rvDetailsLocal.model" type="text" class="w-full")
                UFormField(label="RV class")
                  USelect(
                    v-model="rvDetailsLocal.rvClass"
                    class="w-full"
                    :items="rvClassItems"
                    valueKey="id"
                    labelKey="name")
                div(class="grid grid-cols-1 sm:grid-cols-2 gap-3")
                  UFormField(label="Mileage")
                    UInputNumber(v-model="rvDetailsLocal.mileage" :min="0" :step="1" class="w-full")
                  UFormField(label="ZIP (optional)" hint="5-digit US")
                    UInput(v-model="rvDetailsLocal.zip" type="text" maxlength="5" class="w-full")
                UFormField(label="Condition")
                  USelect(
                    v-model="rvDetailsLocal.condition"
                    class="w-full"
                    :items="vehicleConditionItems"
                    valueKey="id"
                    labelKey="name")
                UFormField(label="Purchase hint (optional)")
                  UInputNumber(
                    v-model="rvDetailsLocal.purchasePriceHint"
                    :format-options="formatCurrencyOptions"
                    :step="0.01"
                    class="w-full")

              template(v-else-if="currentAssetCategory === 'motorcycle'")
                div(class="grid grid-cols-1 sm:grid-cols-2 gap-3")
                  UFormField(label="Year")
                    UInputNumber(v-model="motorcycleDetailsLocal.year" :min="1900" :max="2100" :step="1" class="w-full")
                  UFormField(label="Mileage")
                    UInputNumber(v-model="motorcycleDetailsLocal.mileage" :min="0" :step="1" class="w-full")
                UFormField(label="Make")
                  UInput(v-model="motorcycleDetailsLocal.make" type="text" class="w-full")
                UFormField(label="Model")
                  UInput(v-model="motorcycleDetailsLocal.model" type="text" class="w-full")
                div(class="grid grid-cols-1 sm:grid-cols-2 gap-3")
                  UFormField(label="Engine CC (optional)")
                    UInputNumber(v-model="motorcycleDetailsLocal.engineCC" :min="1" :step="1" class="w-full")
                  UFormField(label="ZIP (optional)" hint="5-digit US")
                    UInput(v-model="motorcycleDetailsLocal.zip" type="text" maxlength="5" class="w-full")
                UFormField(label="Condition")
                  USelect(
                    v-model="motorcycleDetailsLocal.condition"
                    class="w-full"
                    :items="vehicleConditionItems"
                    valueKey="id"
                    labelKey="name")
                UFormField(label="Purchase hint (optional)")
                  UInputNumber(
                    v-model="motorcycleDetailsLocal.purchasePriceHint"
                    :format-options="formatCurrencyOptions"
                    :step="0.01"
                    class="w-full")

              UButton(
                color="primary"
                variant="subtle"
                :loading="isEstimatingAsset"
                :disabled="isSaving || isDeleting || isEstimatingAsset"
                @click.prevent="runAssetEstimate"
              ) Get estimate

              div(v-if="lastAssetEstimate" class="space-y-2 text-sm")
                p(class="font-medium text-emerald-900 dark:text-emerald-100") {{ estimateRangeLabel }}
                p(class="text-emerald-800/90 dark:text-emerald-200/90") {{ lastAssetEstimate.rationale }}
                p(class="text-xs text-emerald-800/70 dark:text-emerald-300/80") {{ lastAssetEstimate.disclaimer }}

              .flex.flex-wrap.gap-2(v-if="lastAssetEstimate")
                UButton(size="sm" color="neutral" variant="subtle" @click.prevent="applyEstimateToBalance" :disabled="isSaving || isDeleting") Apply mid to balance
                UButton(size="sm" color="neutral" variant="subtle" @click.prevent="applyEstimateToOriginal" :disabled="isSaving || isDeleting") Apply mid to original value

        template(#import)
          div(class="space-y-4 pt-2")
            UFormField(label="Import Transactions" hint="optional, CSV File Import")
              UInput(type="file" accept=".csv" ref="fileInput" class="w-full")

  template(#footer)
    .w-full
      div(
        v-if="showArchiveConfirm"
        class="mb-3 p-3 rounded-md border border-error/30 bg-error/10 text-sm")
        p(class="mb-2") Archive this account? It will be hidden from your account list and from dropdowns.
        div(class="modal-action-group")
          UButton(
            color="error"
            @click="archiveAccountRegister"
            :loading="isDeleting"
            :disabled="isSaving || isDeleting"
            class="modal-action-button"
          ) Confirm archive
          UButton(
            color="neutral"
            @click="cancelArchiveConfirmation"
            :disabled="isDeleting"
            class="modal-action-button"
          ) Cancel
      .modal-action-bar.modal-action-bar--between
        .modal-action-group
          UButton(
            color="primary"
            @click.prevent="form?.submit()"
            :loading="isSaving"
            :disabled="isSaving || isDeleting || (isSelectedAccountTypeCash && formState.id > 0 && cashLoading)"
            class="modal-action-button"
          ) Save
          UButton(
            color="error"
            v-if="formState.id"
            @click="confirmArchive"
            :loading="isDeleting"
            :disabled="isSaving || isDeleting || showArchiveConfirm"
            class="modal-action-button"
          ) Archive
        UButton(@click="cancel" color="neutral" :disabled="isSaving || isDeleting" class="modal-action-button") Close
</template>
