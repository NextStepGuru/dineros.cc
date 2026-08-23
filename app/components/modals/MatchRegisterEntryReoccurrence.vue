<script setup lang="ts">
import { handleError, formatCurrencyOptions } from "~/lib/utils";
import { matchesTableGlobalFilter } from "~/lib/tableGlobalFilterMatch";
import type { RegisterEntry, Reoccurrence } from "~/types/types";

export type MatchRegisterEntryReoccurrenceProps = {
  registerEntry: RegisterEntry;
  callback: () => void;
  cancel: () => void;
};

const props = defineProps<MatchRegisterEntryReoccurrenceProps>();

const listStore = useListStore();
const toast = useToast();
const { $api } = useNuxtApp();

const filterText = ref("");
const selectedId = ref<number | null>(null);
const isSaving = ref(false);

const currencyFmt = new Intl.NumberFormat("en-US", formatCurrencyOptions);

const recurrencesForRegister = computed(() =>
  listStore.getReoccurrencesForCurrentBudget.filter(
    (r) => r.accountRegisterId === props.registerEntry.accountRegisterId,
  ),
);

const entryAmount = computed(() => Number(props.registerEntry.amount));

function recurrenceSortScore(r: Reoccurrence): number {
  const amountDiff = Math.abs(Number(r.amount) - entryAmount.value);
  return amountDiff;
}

const filteredRecurrences = computed(() => {
  const list = recurrencesForRegister.value.filter((r) =>
    matchesTableGlobalFilter(filterText.value, [r.description]),
  );
  return [...list].sort((a, b) => recurrenceSortScore(a) - recurrenceSortScore(b));
});

function rowClasses(r: Reoccurrence) {
  return selectedId.value === r.id
    ? "bg-primary/15 border-primary/40"
    : "frog-border hover:bg-elevated/50";
}

async function confirmMatch() {
  const id = selectedId.value;
  const entryId = props.registerEntry.id;
  if (id == null || !entryId) {
    toast.add({
      color: "error",
      description: "Select a recurrence to match.",
    });
    return;
  }
  isSaving.value = true;
  try {
    const res = await $api("/api/register-entry-match-reoccurrence", {
      method: "POST",
      body: {
        registerEntryId: entryId,
        accountRegisterId: props.registerEntry.accountRegisterId,
        reoccurrenceId: id,
      },
    }).catch((err: unknown) => {
      handleError(err instanceof Error ? err : new Error(String(err)), toast);
      return null;
    });
    if (!res) return;
    toast.add({
      color: "success",
      description:
        "Matched. Future imports with similar bank names can auto-link to this recurrence, including when the amount varies.",
    });
    await listStore.fetchLists();
    props.callback();
  } finally {
    isSaving.value = false;
  }
}

defineShortcuts({
  enter: {
    usingInput: true,
    handler: () => {
      if (isSaving.value) return;
      if (selectedId.value == null || !filteredRecurrences.value.length) return;
      void confirmMatch();
    },
  },
  escape: () => {
    if (!isSaving.value) props.cancel();
  },
});
</script>

<template lang="pug">
UModal(title="Match to existing recurrence" class="modal-mobile-fullscreen max-w-lg")
  template(#body)
    .space-y-3
      p.text-sm.frog-text-muted
        | Bank line:
        span.font-medium.text-highlighted.ml-1 {{ registerEntry.description }}
        span.ml-2 ({{ currencyFmt.format(Number(registerEntry.amount)) }})
      p.text-xs.frog-text-muted
        | Saves bank name aliases for this register. Future Plaid syncs can merge into the matching forecast line by name and date (amount may differ for variable bills). AI matching also helps when aliases are not enough.

      UInput(
        v-model="filterText"
        placeholder="Search recurrences…"
        icon="i-lucide-search"
        class="w-full"
        :disabled="isSaving")

      .max-h-64.overflow-y-auto.rounded-lg.border.frog-border.divide-y.divide-default(
        v-if="filteredRecurrences.length"
        role="listbox"
        aria-label="Recurrences")
        button(
          v-for="r in filteredRecurrences"
          :key="r.id"
          type="button"
          class="block w-full text-left px-3 py-2.5 transition-colors"
          :class="rowClasses(r)"
          @click="selectedId = r.id")
          .font-medium.text-sm {{ r.description }}
          .text-xs.frog-text-muted(class="mt-0.5") {{ currencyFmt.format(Number(r.amount)) }}

      p.text-sm.frog-text-muted.py-4.text-center(v-else-if="recurrencesForRegister.length === 0")
        | No recurrences exist for this register. Create one from the Reoccurrences page or use the repeat button on the register row.

      p.text-sm.frog-text-muted.py-4.text-center(v-else) No results. Try another search.

  template(#footer)
    .modal-action-bar
      UButton(color="neutral" variant="soft" :disabled="isSaving" @click="cancel" class="modal-action-button") Cancel
      UButton(
        color="primary"
        :loading="isSaving"
        :disabled="isSaving || selectedId == null || !filteredRecurrences.length"
        class="modal-action-button"
        @click="confirmMatch") Match
</template>
