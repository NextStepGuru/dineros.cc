<script setup lang="ts">
import type { SavingsGoal } from "~/types/types";
import { createSavingsGoalSchema } from "~/schema/zod";
import {
  handleError,
  formatAccountRegisters,
  formatCurrencyOptions,
} from "~/lib/utils";
import { buildSortedCategorySelectItems } from "~/lib/categorySelect";

export type EditSavingsGoalProps = {
  goal: SavingsGoal | null;
  callback: (goal: SavingsGoal) => void;
  cancel: () => void;
};

defineOptions({ inheritAttrs: false });

const props = defineProps<EditSavingsGoalProps>();
defineEmits(["close", "after:leave"]);
const toast = useToast();
const listStore = useListStore();
const { $api } = useNuxtApp();

const isCreate = computed(() => props.goal == null);
const isSubmitting = ref(false);
const showDeleteConfirm = ref(false);

const formState = ref({
  name: "",
  targetAmount: 0,
  sourceAccountRegisterId: 0,
  targetAccountRegisterId: 0,
  priorityOverDebt: false,
  ignoreMinBalance: false,
  categoryId: null as string | null,
});

const accountRegisters = computed(() =>
  formatAccountRegisters(listStore.getAccountRegisters),
);

const accountIdForCategories = computed(() => {
  const reg = listStore.getAccountRegisters.find(
    (r) => r.id === formState.value.sourceAccountRegisterId,
  );
  return reg?.accountId ?? props.goal?.accountId ?? null;
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
      accountIdForCategories.value,
    ),
  ];
});

watch(
  () => props.goal,
  (g) => {
    if (g) {
      formState.value = {
        name: g.name,
        targetAmount: g.targetAmount,
        sourceAccountRegisterId: g.sourceAccountRegisterId,
        targetAccountRegisterId: g.targetAccountRegisterId,
        priorityOverDebt: g.priorityOverDebt,
        ignoreMinBalance: g.ignoreMinBalance,
        categoryId: g.categoryId ?? null,
      };
    } else {
      const first = accountRegisters.value[0];
      formState.value = {
        name: "",
        targetAmount: 0,
        sourceAccountRegisterId: first?.id ?? 0,
        targetAccountRegisterId: first?.id ?? 0,
        priorityOverDebt: false,
        ignoreMinBalance: false,
        categoryId: null,
      };
    }
  },
  { immediate: true },
);

watch(
  () => [
    formState.value.sourceAccountRegisterId,
    accountIdForCategories.value,
  ] as const,
  () => {
    const allowed = new Set(
      categorySelectItems.value
        .map((i) => i.value)
        .filter((v): v is string => v != null && v !== ""),
    );
    const cid = formState.value.categoryId;
    if (cid && !allowed.has(cid)) {
      formState.value.categoryId = null;
    }
  },
);

const schema = createSavingsGoalSchema;

function handleSubmit({ data }: { data: typeof formState.value }) {
  if (isSubmitting.value) return;
  isSubmitting.value = true;
  if (isCreate.value) {
    $api<SavingsGoal>("/api/savings-goal", {
      method: "POST",
      body: data,
    })
      .then((created) => {
        listStore.addSavingsGoal(created);
        toast.add({ color: "success", description: "Goal created." });
        props.callback(created);
      })
      .catch((err) => handleError(err, toast))
      .finally(() => {
        isSubmitting.value = false;
      });
  } else if (props.goal) {
    $api<SavingsGoal>(`/api/savings-goal/${props.goal.id}`, {
      method: "PATCH",
      body: data,
    })
      .then((updated) => {
        listStore.patchSavingsGoal(updated);
        toast.add({ color: "success", description: "Goal updated." });
        props.callback(updated);
      })
      .catch((err) => handleError(err, toast))
      .finally(() => {
        isSubmitting.value = false;
      });
  }
}

function handleFormError(event: unknown) {
  handleError(event as Error, toast);
}

async function handleDelete() {
  if (!props.goal || isSubmitting.value) return;
  showDeleteConfirm.value = false;
  isSubmitting.value = true;
  try {
    await $api(`/api/savings-goal/${props.goal.id}`, { method: "DELETE" });
    listStore.removeSavingsGoal(props.goal.id);
    toast.add({ color: "success", description: "Goal archived." });
    props.callback(props.goal);
  } catch (err) {
    handleError(err as Error, toast);
  } finally {
    isSubmitting.value = false;
  }
}

defineShortcuts({
  escape: () => {
    props.cancel();
  },
});
</script>

<template>
  <div>
  <UModal v-bind="$attrs" :ui="{ width: 'sm:max-w-md' }">
    <template #header>
      {{ isCreate ? "Add goal" : "Edit goal" }}
    </template>

    <template #body>
      <UForm
        :schema="schema"
        :state="formState"
        class="space-y-5"
        @submit="handleSubmit"
        @error="handleFormError"
      >
        <UFormField label="Name" name="name" for="goal-name" required>
          <UInput
            id="goal-name"
            v-model="formState.name"
            class="w-full"
            placeholder="e.g. Boat fund"
            data-1p-ignore
          />
        </UFormField>

        <UFormField label="Category" name="categoryId" for="goal-category">
          <USelectMenu
            id="goal-category"
            v-model="formState.categoryId"
            class="w-full"
            :items="categorySelectItems"
            value-key="value"
            label-key="label"
            :filter-fields="['label', 'name']"
            placeholder="None"
          />
        </UFormField>

        <UFormField label="Target amount" name="targetAmount" for="goal-targetAmount" required>
          <UInputNumber
            id="goal-targetAmount"
            v-model="formState.targetAmount"
            class="w-full"
            :format-options="formatCurrencyOptions"
            :min="0.01"
            :step="1"
            placeholder="0.00"
          />
        </UFormField>

        <UFormField label="Source account (pull from)" name="sourceAccountRegisterId" for="goal-source" required>
          <USelect
            id="goal-source"
            v-model="formState.sourceAccountRegisterId"
            class="w-full"
            placeholder="Select account"
            :items="accountRegisters"
            value-key="id"
            label-key="name"
          />
        </UFormField>

        <UFormField label="Target account (pocket)" name="targetAccountRegisterId" for="goal-target" required>
          <USelect
            id="goal-target"
            v-model="formState.targetAccountRegisterId"
            class="w-full"
            placeholder="Select account"
            :items="accountRegisters"
            value-key="id"
            label-key="name"
          />
        </UFormField>

        <UFormField label="Priority over debt" name="priorityOverDebt" class="pt-1">
          <UCheckbox
            v-model="formState.priorityOverDebt"
            label="Fund this goal before extra debt payments"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Ignore min balance" name="ignoreMinBalance" class="pt-1">
          <UCheckbox
            v-model="formState.ignoreMinBalance"
            label="Allow pulling below source account minimum balance"
            class="w-full"
          />
        </UFormField>

        <div class="flex flex-wrap gap-2 justify-end pt-6 border-t border-gray-200 dark:border-gray-700">
          <UButton
            v-if="!isCreate"
            type="button"
            color="error"
            variant="soft"
            :loading="isSubmitting"
            :disabled="isSubmitting"
            @click="showDeleteConfirm = true"
          >
            Archive
          </UButton>
          <UButton type="button" variant="soft" @click="props.cancel()">
            Cancel
          </UButton>
          <UButton
            type="submit"
            color="primary"
            :loading="isSubmitting"
            :disabled="isSubmitting"
          >
            {{ isCreate ? "Create" : "Save" }}
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>

  <UModal v-model:open="showDeleteConfirm" :ui="{ width: 'sm:max-w-sm' }">
    <template #header>Archive goal?</template>
    <template #body>
      <p class="text-sm">This goal will be archived. You can add a new goal anytime.</p>
    </template>
    <template #footer>
      <UButton variant="soft" @click="showDeleteConfirm = false">Cancel</UButton>
      <UButton color="error" @click="handleDelete">Archive</UButton>
    </template>
  </UModal>
  </div>
</template>
