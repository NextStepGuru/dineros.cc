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
  <output
    v-if="mode"
    class="pointer-events-none fixed top-2 left-3 z-100 inline-flex max-w-[min(18rem,calc(100vw-1.5rem))] items-center rounded-md border px-2.5 py-1 text-left text-xs font-semibold tracking-wide shadow-md sm:left-4 sm:text-sm"
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
