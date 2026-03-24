<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    amount: number | null | undefined;
    nullLabel?: string;
  }>(),
  {
    nullLabel: "—",
  },
);

const numericAmount = computed(() =>
  props.amount == null ? null : Number(props.amount),
);

const displayClass = computed(() => {
  if (numericAmount.value == null) return "frog-text-muted";
  if (numericAmount.value > 0) return "dark:text-green-300 text-green-700";
  if (numericAmount.value < 0) return "dark:text-red-300 text-red-700";
  return "frog-text-muted";
});

const sign = computed(() => {
  if (numericAmount.value == null) return "";
  if (numericAmount.value > 0) return "+";
  if (numericAmount.value < 0) return "−";
  return "";
});

const formatted = computed(() => {
  if (numericAmount.value == null) return props.nullLabel;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Math.abs(numericAmount.value));
});
</script>

<template>
  <span :class="displayClass">{{ sign }}{{ formatted }}</span>
</template>
