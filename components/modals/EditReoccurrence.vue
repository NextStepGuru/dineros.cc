<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import type { z } from "zod";
import {
  formatDate,
  handleError,
  formatAccountRegisters,
  formatCurrencyOptions,
} from "~/lib/utils";
import type { Reoccurrence } from "~/types/types";

import { reoccurrenceSchema } from "~/schema/zod";
const form = useTemplateRef("form");
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

type Schema = z.output<typeof reoccurrenceSchema>;

const isSaving = ref(false);
const isDeleting = ref(false);
const formState = reactive<Partial<Schema>>(props.reoccurrence);
const isExternal = ref(true);

if (props.reoccurrence.transferAccountRegisterId) {
  isExternal.value = false;
}

watch(props, () => {
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

  if (props.reoccurrence.transferAccountRegisterId) {
    isExternal.value = false;
  }
});

async function handleSubmit({ data: formData }: FormSubmitEvent<Reoccurrence>) {
  try {
    isSaving.value = true;
    const responseData = await $api("/api/reoccurrence", {
      method: "POST",
      body: formData,
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

    props.callback(reoccurrenceSchema.parse(responseData));

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
      "Are you sure you want to delete this reoccurrence? This action cannot be undone."
    )
  ) {
    deleteReoccurrence();
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
UModal(title="Edit Reoccurrence" class="max-sm:!w-full max-sm:!h-full max-sm:!max-w-none max-sm:!max-h-none max-sm:!rounded-none")
  template(#body)
    UForm(:schema="reoccurrenceSchema" :state="formState" class="space-y-4" @submit="handleSubmit" @error="handleError($event, toast)" :disabled="isSaving || isDeleting" ref="form")
      .flex.space-x-4
        UFormField(label="Transfer funds from Account" name="accountRegisterId" class="flex-1")
          USelect(v-model="formState.accountRegisterId"
            placeholder="Select an Account"
            class="w-full"
            :items="formatAccountRegisters(listStore.getAccountRegisters)"
            valueKey="id"
            labelKey="name")
        UFormField(label="External?" class="flex-none text-center justify-center")
          UCheckbox(v-model="isExternal" class="w-4 h-4")
      UFormField(label="Transfer into Account" hint="optional" name="transferAccountRegisterId" class="flex-1" v-if="!isExternal")
        USelect(v-model="formState.transferAccountRegisterId"
          placeholder="Select an Account"
          class="w-full"
          :items="formatAccountRegisters(listStore.getAccountRegisters).filter(item => item.id !== formState.accountRegisterId)"
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
