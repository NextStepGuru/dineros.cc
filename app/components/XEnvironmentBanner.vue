<script setup lang="ts">
const config = useRuntimeConfig();
const deployEnv = computed(() =>
  String(config.public.deployEnv ?? "production"),
);

const mode = computed<"staging" | "local" | null>(() => {
  if (deployEnv.value === "staging") return "staging";
  if (deployEnv.value === "local") return "local";
  return null;
});
</script>

<template>
  <template v-if="mode">
    <div class="h-8 shrink-0" aria-hidden="true" />
    <output
      class="fixed top-0 left-0 right-0 z-100 flex h-8 items-center justify-center border-b px-3 text-center text-xs font-semibold tracking-wide sm:text-sm"
      :aria-label="
        mode === 'staging' ? 'Staging environment' : 'Local development'
      "
      :class="
        mode === 'staging'
          ? 'border-amber-700 bg-amber-400 text-neutral-950'
          : 'border-blue-800 bg-blue-600 text-white'
      "
    >
      <span v-if="mode === 'staging'">Staging — not production data</span>
      <span v-else>Local development</span>
    </output>
  </template>
</template>
