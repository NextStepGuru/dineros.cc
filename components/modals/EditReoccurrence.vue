<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import type { z } from "zod";
import {
  formatDate,
  handleError,
  formatAccountRegisters,
  formatCurrencyOptions,
} from "~/lib/utils";
import { buildSortedCategorySelectItems } from "~/lib/categorySelect";
import type { Reoccurrence } from "~/types/types";

import { reoccurrenceWithSplitsSchema } from "~/schema/zod";
const form = ref<{ submit?: () => void } | null>(null);
const toast = useToast();
const { $api } = useNuxtApp();

export type ModalReoccurrenceProps = {
  title: string;
  description: string;
  callback: (data: Reoccurrence) => void;
  cancel: () => void;
  reoccurrence: Reoccurrence;
};

const listStore = useListStore();
const props = defineProps<ModalReoccurrenceProps>();

type Schema = z.output<typeof reoccurrenceWithSplitsSchema>;

const isSaving = ref(false);
const isDeleting = ref(false);
const formState = reactive<Partial<Schema>>({
  ...props.reoccurrence,
  amountAdjustmentMode: props.reoccurrence.amountAdjustmentMode ?? "NONE",
  amountAdjustmentIntervalCount:
    props.reoccurrence.amountAdjustmentIntervalCount ?? 1,
});
const splitsRef = ref<NonNullable<Schema["splits"]>>(
  (props.reoccurrence.splits ?? []).map((s) => ({
    ...s,
    amount: Number(s.amount),
  })),
);
const isExternal = ref(true);
const accountRegisterOptions = computed(() =>
  formatAccountRegisters(listStore.getAccountRegisters),
);

const accountIdForReoccurrence = computed(() => {
  const reg = listStore.getAccountRegisters.find(
    (r) => r.id === formState.accountRegisterId,
  );
  return reg?.accountId ?? null;
});

const categorySelectItems = computed(() => {
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
      accountIdForReoccurrence.value,
    ),
  ];
});

function syncFormStateFromProps() {
  formState.id = props.reoccurrence.id;
  formState.accountId = props.reoccurrence.accountId;
  formState.lastAt = formatDate(props.reoccurrence.lastAt);
  formState.endAt = formatDate(props.reoccurrence.endAt);
  formState.intervalId = props.reoccurrence.intervalId;
  formState.description = props.reoccurrence.description;
  formState.amount = props.reoccurrence.amount;
  formState.accountRegisterId = props.reoccurrence.accountRegisterId;
  formState.transferAccountRegisterId =
    props.reoccurrence.transferAccountRegisterId;
  formState.intervalCount = props.reoccurrence.intervalCount;
  formState.adjustBeforeIfOnWeekend =
    props.reoccurrence.adjustBeforeIfOnWeekend;
  formState.categoryId =
    props.reoccurrence.categoryId === undefined
      ? null
      : props.reoccurrence.categoryId;
  splitsRef.value = (props.reoccurrence.splits ?? []).map((split) => ({
    ...split,
    amount: Number(split.amount),
    categoryId:
      split.categoryId === undefined ? null : split.categoryId,
  }));

  formState.amountAdjustmentMode =
    props.reoccurrence.amountAdjustmentMode ?? "NONE";
  formState.amountAdjustmentDirection =
    props.reoccurrence.amountAdjustmentDirection ?? null;
  formState.amountAdjustmentValue =
    props.reoccurrence.amountAdjustmentValue ?? null;
  formState.amountAdjustmentIntervalId =
    props.reoccurrence.amountAdjustmentIntervalId ?? null;
  formState.amountAdjustmentIntervalCount =
    props.reoccurrence.amountAdjustmentIntervalCount ?? 1;
  formState.amountAdjustmentAnchorAt = formatDate(
    props.reoccurrence.amountAdjustmentAnchorAt,
  );

  isExternal.value = !props.reoccurrence.transferAccountRegisterId;
}

watch(
  () => props.reoccurrence?.id,
  (newId, oldId) => {
    if (newId !== oldId) syncFormStateFromProps();
  },
  { immediate: true },
);

function addSplit() {
  const current = [...splitsRef.value];
  current.push({
    transferAccountRegisterId: undefined as unknown as number,
    amount: 0,
    description: "",
    categoryId: null,
    sortOrder: current.length,
  });
  splitsRef.value = current;
}

function removeSplit(index: number) {
  const current = [...splitsRef.value];
  current.splice(index, 1);
  splitsRef.value = current.map((split, sortOrder) => ({
    ...split,
    sortOrder,
  }));
}

const splitTargetOptions = computed(() =>
  accountRegisterOptions.value.filter(
    (item) => item.id !== formState.accountRegisterId,
  ),
);

async function handleSubmit({ data: formData }: FormSubmitEvent<Schema>) {
  try {
    isSaving.value = true;
    const payload: Schema = {
      ...formData,
      transferAccountRegisterId: isExternal.value
        ? undefined
        : formData.transferAccountRegisterId,
      splits: splitsRef.value.map((split, sortOrder) => ({
        id: split.id,
        reoccurrenceId: split.reoccurrenceId,
        transferAccountRegisterId: split.transferAccountRegisterId,
        amount: Number(split.amount),
        description: split.description?.trim() || undefined,
        categoryId:
          split.categoryId === undefined || split.categoryId === null
            ? undefined
            : split.categoryId,
        sortOrder,
      })),
    };
    const responseData = await $api("/api/reoccurrence", {
      method: "POST",
      body: payload,
      onRequestError: () => {
        isSaving.value = false;
      },
    }).catch((error) => handleError(error, toast));

    if (!responseData) {
      isSaving.value = false;

      toast.add({
        color: "error",
        description: "Failed to update reoccurrence.",
      });

      return;
    }

    props.callback(reoccurrenceWithSplitsSchema.parse(responseData));

    toast.add({
      color: "success",
      description: "Updated reoccurrence successfully.",
    });

    isSaving.value = false;
  } catch (error) {
    isSaving.value = false;

    toast.add({
      color: "error",
      description:
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : "An error occurred during profile update.",
    });
  }
}

async function deleteReoccurrence() {
  isDeleting.value = true;
  const deleteReoccurrence = await $api("/api/reoccurrence", {
    method: "DELETE",
    params: { reoccurrenceId: formState.id },
    onRequestError: () => {
      isDeleting.value = false;
    },
  });

  if (!deleteReoccurrence) {
    isSaving.value = false;
    toast.add({
      color: "error",
      description: "Failed to delete reoccurrence.",
    });

    return;
  } else {
    toast.add({
      color: "success",
      description: "Deleted reoccurrence successfully.",
    });

    await listStore.fetchLists();

    isDeleting.value = false;
    props.cancel();
  }
}

function confirmDelete() {
  if (
    confirm(
      "Are you sure you want to delete this reoccurrence? This action cannot be undone.",
    )
  ) {
    deleteReoccurrence();
  }
}

const splitCountLabel = computed(() => {
  const count = splitsRef.value.length;
  return `${count} split${count === 1 ? "" : "s"}`;
});

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
UModal(title="Edit Reoccurrence" class="modal-mobile-fullscreen")
  template(#body)
    UForm(:schema="reoccurrenceWithSplitsSchema" :state="formState" class="space-y-4" @submit="handleSubmit" @error="handleError($event, toast)" :disabled="isSaving || isDeleting" ref="form")
      .flex.space-x-4
        UFormField(label="Transfer funds from Account" name="accountRegisterId" class="flex-1")
          USelect(v-model="formState.accountRegisterId"
            placeholder="Select an Account"
            class="w-full"
            :items="accountRegisterOptions"
            valueKey="id"
            labelKey="name")
        UFormField(label="External?" class="flex-none text-center justify-center")
          UCheckbox(v-model="isExternal" class="w-4 h-4")
      UFormField(label="Transfer into Account" hint="optional" name="transferAccountRegisterId" class="flex-1" v-if="!isExternal")
        USelect(v-model="formState.transferAccountRegisterId"
          placeholder="Select an Account"
          class="w-full"
          :items="splitTargetOptions"
          valueKey="id"
          labelKey="name")

      .flex.space-x-4
        UFormField(label="Count" name="intervalCount" class="flex-none")
          UInput(v-model="formState.intervalCount" class="w-24")
        UFormField(label="Interval" name="intervalId" class="flex-1")
          USelect(v-model="formState.intervalId"
            placeholder="Select an Interval"
            class="w-full"
            :items="listStore.getIntervals.map(i => ({ id: i.id, name: i.name }))"
            valueKey="id"
            labelKey="name")

      UFormField(label="Adjust before if on weekend" name="adjustBeforeIfOnWeekend")
        UCheckbox(v-model="formState.adjustBeforeIfOnWeekend"
          label="Move to previous business day if weekend or holiday")

      UFormField(label="Description" name="description")
        UInput(v-model="formState.description" class="w-full")

      UFormField(label="Category" hint="applied to generated register entries" name="categoryId")
        USelectMenu(
          v-model="formState.categoryId"
          class="w-full"
          :items="categorySelectItems"
          value-key="value"
          label-key="label"
          :filter-fields="['label', 'name']"
          placeholder="None")

      .space-y-3.border.border-gray-700.rounded-lg.p-3
        UFormField(label="Amount adjustment" hint="independent of payment frequency" name="amountAdjustmentMode")
          USelect(
            v-model="formState.amountAdjustmentMode"
            class="w-full"
            :items="[{ id: 'NONE', name: 'None' }, { id: 'PERCENT', name: 'Percent' }, { id: 'FIXED', name: 'Fixed amount' }]"
            valueKey="id"
            labelKey="name")
        template(v-if="formState.amountAdjustmentMode && formState.amountAdjustmentMode !== 'NONE'")
          .flex.flex-wrap.gap-4
            UFormField(label="Direction" name="amountAdjustmentDirection")
              USelect(
                v-model="formState.amountAdjustmentDirection"
                class="w-full min-w-40"
                :items="[{ id: 'INCREASE', name: 'Increase' }, { id: 'DECREASE', name: 'Decrease' }]"
                valueKey="id"
                labelKey="name")
            UFormField(
              label="Value"
              name="amountAdjustmentValue"
              :hint="formState.amountAdjustmentMode === 'PERCENT' ? 'Percent per adjustment period (compounded)' : 'Dollars added per adjustment period'")
                UInputNumber(
                  v-model="formState.amountAdjustmentValue"
                  :step="formState.amountAdjustmentMode === 'PERCENT' ? 0.1 : 0.01"
                  class="w-full min-w-32")
          .flex.space-x-4
            UFormField(label="Count" name="amountAdjustmentIntervalCount")
              UInput(v-model="formState.amountAdjustmentIntervalCount" class="w-24")
            UFormField(label="Adjustment interval" name="amountAdjustmentIntervalId" class="flex-1")
              USelect(
                v-model="formState.amountAdjustmentIntervalId"
                placeholder="Select an Interval"
                class="w-full"
                :items="listStore.getIntervals.map(i => ({ id: i.id, name: i.name }))"
                valueKey="id"
                labelKey="name")
          UFormField(label="Adjustment anchor" hint="optional; leave empty to use first projected occurrence. Update if you change Last run at." name="amountAdjustmentAnchorAt")
            UInput(v-model="formState.amountAdjustmentAnchorAt" type="date" class="w-full")

      .flex(class="md:flex-row flex-col md:space-x-4 max-sm:space-y-4")
        UFormField(label="Amount to Debit" name="amount")
          UInputNumber(
            v-model="formState.amount"
            :format-options="formatCurrencyOptions"
            :step="0.01"
            id="amount"
            class="w-full")

        UFormField(label="Last run at" name="lastAt" class="flex-1")
          UInput(v-model="formState.lastAt" type="date" class="w-full")

        UFormField(label="End at" name="endAt" class="flex-1")
          UInput(v-model="formState.endAt" type="date" class="w-full")

      .space-y-3
        .flex.items-center.justify-between
          UFormField(label="Split transfers")
          UButton(color="neutral" variant="subtle" size="xs" @click="addSplit") Add split
        p.text-xs.text-gray-400 {{ splitCountLabel }}
        .space-y-3(v-if="splitsRef.length > 0")
          .grid.grid-cols-1.gap-3.border.border-gray-700.rounded-lg.p-3(v-for="(split, index) in splitsRef" :key="split.id || 'new-split-' + index")
            .flex.gap-3.items-start.flex-wrap(class="max-sm:flex-col")
              UFormField(label="Amount" class="flex-1 min-w-32")
                UInputNumber(v-model="split.amount" :format-options="formatCurrencyOptions" :step="0.01" class="w-full")
              UFormField(label="Transfer into Account" class="flex-1 min-w-40")
                USelect(v-model="split.transferAccountRegisterId" :items="splitTargetOptions" valueKey="id" labelKey="name" class="w-full" placeholder="Select account")
              UFormField(label="Category" class="flex-1 min-w-40")
                USelectMenu(
                  v-model="split.categoryId"
                  class="w-full"
                  :items="categorySelectItems"
                  value-key="value"
                  label-key="label"
                  :filter-fields="['label', 'name']"
                  placeholder="Same as reoccurrence")
              UFormField(label="Label" class="flex-1 min-w-32")
                UInput(v-model="split.description" class="w-full" placeholder="Optional")
              UTooltip(text="Remove split" :delay-duration="150")
                UButton(color="error" variant="soft" size="xs" square icon="i-lucide-trash-2" class="mt-6 shrink-0" aria-label="Remove split" @click="removeSplit(index)")
        p.text-xs.text-gray-500(v-else) No split transfers configured.

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

      UButton(color="neutral" @click="cancel" :disabled="isSaving || isDeleting") Close
</template>
