<script setup lang="ts">
withDefaults(
  defineProps<{
    icon: string;
    ariaLabel: string;
    size?: string;
    disabled?: boolean;
    loading?: boolean;
    to?: string;
    target?: string;
    /** When true, renders as primary/soft to indicate an active toggle state. */
    active?: boolean;
  }>(),
  {
    size: "lg",
    disabled: false,
    loading: false,
    to: undefined,
    target: undefined,
    active: false,
  },
);
</script>

<template>
  <UButton
    square
    :icon="icon"
    :aria-label="ariaLabel"
    :size="size as any"
    :color="active ? 'primary' : 'neutral'"
    :variant="active ? 'soft' : 'outline'"
    :disabled="disabled"
    :loading="loading"
    :to="to"
    :target="target"
    :class="['base-icon-button', !active && !disabled ? 'icon-btn-hover' : '']"
  />
</template>

<style scoped>
/* Apple HIG 44pt minimum touch target on small screens; height stays 40px at sm+. */
@media (width < 40rem) {
  .base-icon-button {
    min-width: 2.75rem;
    min-height: 2.75rem;
  }
}

.icon-btn-hover:hover {
  background-color: var(--frog-primary);
  color: white;
}
</style>
