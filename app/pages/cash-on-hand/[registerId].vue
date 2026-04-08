<script setup lang="ts">
import { formatMoneyUsd } from "~/lib/bankers-rounding";
import {
  bumpCashDenomCount,
  CASH_DENOM_CONFIG,
  subtotalForCashDenom,
  totalDollarsFromCashCounts,
  ZERO_CASH_COUNTS,
  type CashDenomCounts,
  type CashDenomKey,
} from "~/lib/cashDenominations";

definePageMeta({
  middleware: "auth",
});

type CashOnHandResponse = {
  registerId: number;
  registerName: string;
  accountId: string;
  ones: number;
  fives: number;
  tens: number;
  twenties: number;
  fifties: number;
  hundreds: number;
};

const route = useRoute();
const toast = useToast();
const { $api } = useNuxtApp();

const registerId = computed(() => {
  const r = route.params.registerId;
  const raw = Array.isArray(r) ? r[0] : r;
  const n =
    typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(n) && n > 0 ? n : Number.NaN;
});

const loading = ref(true);
const saving = ref(false);
const registerName = ref("");
const counts = ref<CashDenomCounts>({ ...ZERO_CASH_COUNTS });

const totalDollars = computed(() =>
  totalDollarsFromCashCounts(counts.value),
);

function subtotal(key: CashDenomKey): number {
  return subtotalForCashDenom(key, counts.value);
}

function bump(key: CashDenomKey, delta: number) {
  bumpCashDenomCount(counts, key, delta);
}

async function load() {
  const id = registerId.value;
  if (!Number.isFinite(id)) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const res = (await ($api as typeof $fetch)(
      `/api/cash-on-hand/${id}`,
    )) as CashOnHandResponse;
    registerName.value = res.registerName;
    counts.value = {
      ones: res.ones,
      fives: res.fives,
      tens: res.tens,
      twenties: res.twenties,
      fifties: res.fifties,
      hundreds: res.hundreds,
    } satisfies CashDenomCounts;
    useHead({
      title: `Cash count — ${res.registerName} | Dineros`,
    });
  } catch {
    toast.add({
      color: "error",
      description: "Failed to load cash count.",
    });
  } finally {
    loading.value = false;
  }
}

async function save() {
  const id = registerId.value;
  if (!Number.isFinite(id)) return;
  saving.value = true;
  try {
    await ($api as typeof $fetch)(`/api/cash-on-hand/${id}`, {
      method: "PATCH",
      body: { ...counts.value },
    });
    toast.add({
      color: "success",
      description: "Cash count updated.",
    });
  } catch {
    toast.add({
      color: "error",
      description: "Failed to save cash count.",
    });
  } finally {
    saving.value = false;
  }
}

watch(
  registerId,
  () => {
    void load();
  },
  { immediate: true },
);
</script>

<template lang="pug">
div(class="max-w-lg mx-auto px-4 py-6")
  div(v-if="loading" class="text-muted") Loading…
  div(v-else-if="!Number.isFinite(registerId) || Number.isNaN(registerId)")
    p(class="text-error") Invalid account register.
  div(v-else)
    div(class="mb-6")
      NuxtLink(
        to="/account-registers"
        class="text-sm frog-link inline-flex items-center gap-1 mb-2"
      )
        UIcon(name="i-lucide-arrow-left" class="text-base")
        span Back to Accounts
      h1(class="text-2xl font-semibold frog-text") Cash count
      p(class="text-muted mt-1 truncate") {{ registerName }}

    UCard
      div(class="text-center py-4 border-b border-default mb-4")
        p(class="text-sm text-muted mb-1") Total (from bills)
        p(class="text-3xl font-bold tabular-nums frog-text") {{ formatMoneyUsd(totalDollars) }}

      div(class="space-y-4")
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
              :disabled="saving"
              @click="bump(d.key, -1)"
              aria-label="Decrease"
            )
              UIcon(name="i-lucide-minus" class="w-4 h-4")
            UInputNumber(
              v-model="counts[d.key]"
              :min="0"
              :step="1"
              class="w-24"
              :disabled="saving"
            )
            UButton(
              color="neutral"
              variant="soft"
              size="sm"
              :disabled="saving"
              @click="bump(d.key, 1)"
              aria-label="Increase"
            )
              UIcon(name="i-lucide-plus" class="w-4 h-4")
          span(class="text-right text-muted tabular-nums sm:w-28") {{ formatMoneyUsd(subtotal(d.key)) }}

      div(class="mt-6 flex justify-end")
        UButton(
          :loading="saving"
          :disabled="saving"
          @click="save"
        ) Save
</template>
