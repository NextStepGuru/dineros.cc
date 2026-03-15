<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import {
  handleError,
  formatAccountRegisters,
  formatCurrencyOptions,
} from "~/lib/utils";
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

const form = ref();
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
  accountRegister: AccountRegister
): AccountRegister {
  return {
    ...accountRegister,
    typeId: toNullableNumber(accountRegister.typeId) ?? 0,
    budgetId: toNullableNumber(accountRegister.budgetId) ?? 0,
    subAccountRegisterId: toNullableNumber(accountRegister.subAccountRegisterId),
    balance: toNullableNumber(accountRegister.balance) ?? 0,
    latestBalance: toNullableNumber(accountRegister.latestBalance) ?? 0,
    minPayment: toNullableNumber(accountRegister.minPayment),
    statementIntervalId: toNullableNumber(accountRegister.statementIntervalId),
    apr1: toNullableNumber(accountRegister.apr1),
    apr2: toNullableNumber(accountRegister.apr2),
    apr3: toNullableNumber(accountRegister.apr3),
    targetAccountRegisterId: toNullableNumber(
      accountRegister.targetAccountRegisterId
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
  };
}

const formState = ref<AccountRegister>(
  normalizeAccountRegisterState(props.accountRegister)
);

const fileInput = ref<any>(null);

const selectedAccountType = computed(() => {
  return listStore.getAccountTypes.find(
    (type) => type.id === formState.value.typeId
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
      "Are you sure you want to delete this account register? This action cannot be undone."
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
UModal(title="Edit Account Register" description="Edit Account Register" class="max-sm:!w-full max-sm:!h-full max-sm:!max-w-none max-sm:!max-h-none max-sm:!rounded-none")
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
