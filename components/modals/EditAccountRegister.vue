<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import {
  handleError,
  formatAccountRegisters,
  formatCurrencyOptions,
} from "~/lib/utils";
import { buildSortedCategorySelectItems } from "~/lib/categorySelect";
import { accountRegisterSchema } from "~/schema/zod";
import type { AccountRegister } from "~/types/types";

export type ModelAccountRegisterProps = {
  id: number;
  title: string;
  description: string;
  accountRegister: AccountRegister;
  callback: (data: AccountRegister) => void;
  cancel: () => void;
};

const { $api } = useNuxtApp();

const isSaving = ref(false);
const isDeleting = ref(false);

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
    statementIntervalId: toNullableNumber(accountRegister.statementIntervalId),
    apr1: toNullableNumber(accountRegister.apr1),
    apr2: toNullableNumber(accountRegister.apr2),
    apr3: toNullableNumber(accountRegister.apr3),
    targetAccountRegisterId: toNullableNumber(
      accountRegister.targetAccountRegisterId,
    ),
    collateralAssetRegisterId: toNullableNumber(
      accountRegister.collateralAssetRegisterId,
    ),
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
    assetStartAt:
      accountRegister.assetStartAt != null
        ? new Date(accountRegister.assetStartAt)
        : null,
    paymentCategoryId: accountRegister.paymentCategoryId ?? null,
    interestCategoryId: accountRegister.interestCategoryId ?? null,
  };
}

const formState = ref<AccountRegister>(
  normalizeAccountRegisterState(props.accountRegister),
);

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

const isSelectedAccountTypeWithInterest = computed(() => {
  return (
    isSelectedAccountTypeCredit.value || isSelectedAccountTypeSavings.value
  );
});

const isSelectedAccountTypeVehicleAsset = computed(
  () => selectedAccountType.value?.id === 20,
);
const isSelectedAccountTypeCollectableVehicle = computed(
  () => selectedAccountType.value?.id === 21,
);
const isSelectedAccountTypeDepreciatingOrAppreciatingAsset = computed(
  () =>
    isSelectedAccountTypeVehicleAsset.value ||
    isSelectedAccountTypeCollectableVehicle.value,
);

const assetSectionLabel = computed(() =>
  isSelectedAccountTypeVehicleAsset.value ? "Depreciation" : "Appreciation",
);

const depreciationRatePercent = computed({
  get: () =>
    formState.value.depreciationRate != null
      ? formState.value.depreciationRate * 100
      : null,
  set: (v: number | null) => {
    formState.value.depreciationRate =
      v != null && Number.isFinite(v) ? v / 100 : null;
  },
});

const assetStartAtString = computed({
  get: () => {
    const d = formState.value.assetStartAt;
    if (!d) return "";
    const date = d instanceof Date ? d : new Date(d);
    return date.toISOString().split("T")[0];
  },
  set: (value: string) => {
    formState.value.assetStartAt = value ? new Date(value) : null;
  },
});

const interestRateLabel = computed(() => {
  if (isSelectedAccountTypeSavings.value) {
    return "Interest Rate (%)";
  } else if (isSelectedAccountTypeCredit.value) {
    return "APR (%)";
  }
  return "Interest Rate (%)";
});

const interestRateHint = computed(() => {
  if (isSelectedAccountTypeSavings.value) {
    return "Annual Interest Rate earned (0-100%)";
  } else if (isSelectedAccountTypeCredit.value) {
    return "Annual Percentage Rate (0-100%)";
  }
  return "Annual Interest Rate (0-100%)";
});

// Convert statementAt Date to string for date input
const statementAtString = computed({
  get: () => {
    if (!formState.value.statementAt) return "";
    const date = new Date(formState.value.statementAt);
    return date.toISOString().split("T")[0];
  },
  set: (value: string) => {
    if (value) {
      formState.value.statementAt = new Date(value);
    } else {
      formState.value.statementAt = today.value;
    }
  },
});

watch(props, () => {
  formState.value = normalizeAccountRegisterState(props.accountRegister);
});

watch(
  () => formState.value.typeId,
  () => {
    if (!isSelectedAccountTypeCredit.value) {
      formState.value.collateralAssetRegisterId = null;
      formState.value.targetAccountRegisterId = null;
      formState.value.paymentCategoryId = null;
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
    if (taken.has(r.id) && formState.value.collateralAssetRegisterId !== r.id) {
      continue;
    }
    items.push({ id: r.id, name: r.name });
  }
  return items;
});

async function handleSubmit({
  data: formData,
}: FormSubmitEvent<AccountRegister>) {
  try {
    isSaving.value = true;

    const fileInputData = new FormData();
    const fileInputs = fileInput?.value?.inputRef as HTMLInputElement;
    if (fileInputs && fileInputs.files?.[0]) {
      fileInputData.append("fileData", fileInputs.files[0]);
      fileInputData.append("accountRegisterId", formData.id.toString());

      await $api("/api/upload-file", {
        method: "POST",
        body: fileInputData,
      });
    }

    const payload = { ...formData, latestBalance: formData.balance };
    const responseData = await $api("/api/account-register", {
      method: "POST",
      body: payload,
      onResponseError: () => {
        isSaving.value = false;
      },
    }).catch((error) => handleError(error, toast));

    if (!responseData) {
      isSaving.value = false;
      toast.add({
        color: "error",
        description: "Failed to update account register.",
      });

      return;
    }

    formState.value = accountRegisterSchema.parse(responseData);

    props.callback(formState.value);

    toast.add({
      color: "success",
      description: "Updated account register successfully.",
    });

    isSaving.value = false;

    props.cancel();
  } catch (error) {
    toast.add({
      color: "error",
      description:
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : "An error occurred during account register update.",
    });
  }
  isSaving.value = false;
}

async function deleteAccountRegister() {
  isDeleting.value = true;
  const result = await $api("/api/account-register", {
    method: "DELETE",
    params: { accountRegisterId: formState.value.id },
    onResponseError: () => {
      isDeleting.value = false;
    },
  }).catch((error) => handleError(error, toast));

  if (!result) {
    isSaving.value = false;
    toast.add({
      color: "error",
      description: "Failed to delete account register.",
    });

    return;
  } else {
    toast.add({
      color: "success",
      description: "Deleted account register successfully.",
    });

    await listStore.fetchLists();
    isDeleting.value = false;
    props.cancel();
  }
}

function confirmDelete() {
  if (
    confirm(
      "Are you sure you want to delete this account register? This action cannot be undone.",
    )
  ) {
    deleteAccountRegister();
  }
}

// ESC key handler to close modal
defineShortcuts({
  escape: () => {
    if (!isSaving.value && !isDeleting.value) {
      props.cancel();
    }
  },
});
</script>

<template lang="pug">
UModal(title="Edit Account Register" description="Edit Account Register" class="modal-mobile-fullscreen")
  template(#body)
    UForm(class="space-y-4" @submit.prevent="handleSubmit" :schema="accountRegisterSchema" :state="formState" @error="handleError($event, toast)" :disabled="isSaving || isSaving" ref="form")
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
          :items="formatAccountRegisters(listStore.getAccountRegisters).filter(register => register.typeId !== 15 && register.id !== formState.id)"
          valueKey="id"
          labelKey="name")

      UFormField(label="Name" name="name")
        UInput(v-model="formState.name" type="text" id="name" class="w-full")

      UFormField(label="Account Balance" name="balance")
        UInputNumber(
          v-model="formState.balance"
          :format-options="formatCurrencyOptions"
          :step="0.01"
          id="balance" class="w-full")

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
            v-model="formState.apr1"
            :format-options="{ style: 'decimal', minimumFractionDigits: 1, maximumFractionDigits: 3 }"
            :step="0.001"
            :min="0"
            :max="100"
            class="w-full")

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

      // Savings Goal Fields (only for savings type accounts)
      div(v-if="isSelectedAccountTypeSavings" class="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800")
        h3(class="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2") Savings Goal Settings

        UFormField(label="Savings Goal Amount" name="accountSavingsGoal" hint="target amount to save")
          UInputNumber(
            v-model="formState.accountSavingsGoal"
            :format-options="formatCurrencyOptions"
            :step="0.01"
            class="w-full")

      // Depreciation/Appreciation (Vehicle Asset, Collectable Vehicle)
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

        UFormField(label="Method" name="depreciationMethod" v-if="isSelectedAccountTypeVehicleAsset" hint="declining-balance, straight-line, or compound")
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

        UFormField(label="Useful life (years)" name="assetUsefulLifeYears" v-if="isSelectedAccountTypeVehicleAsset" hint="For straight-line method")
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

      UFormField(label="Import Transactions" hint="optional, CSV File Import")
        UInput(type="file" accept=".csv" ref="fileInput" class="w-full")

  template(#footer)
    .flex.justify-between.w-full
      UButton(
        color="primary"
        @click.prevent="form?.submit()"
        :loading="isSaving"
        :disabled="isSaving || isDeleting"
      ) Save

      UButton(
        color="error"
        v-if="formState.id"
        @click="confirmDelete"
        :loading="isDeleting"
        :disabled="isSaving || isDeleting"
      ) Delete

      UButton(@click="cancel" color="neutral" :disabled="isSaving || isDeleting") Close
</template>
