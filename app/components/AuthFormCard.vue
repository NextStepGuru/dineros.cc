<script setup lang="ts">
withDefaults(
  defineProps<{
    icon: string;
    title: string;
    subtitle?: string | null;
  }>(),
  { subtitle: null },
);
</script>

<template>
  <UCard class="auth-card w-full max-w-md p-8 rounded-2xl">
    <template #header>
      <div class="auth-card__header">
        <UIcon :name="icon" class="size-10 text-primary" />
        <h1 class="text-2xl font-bold">
          {{ title }}
        </h1>
        <p v-if="subtitle" class="text-sm frog-text-muted">
          {{ subtitle }}
        </p>
      </div>
    </template>
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </UCard>
</template>
