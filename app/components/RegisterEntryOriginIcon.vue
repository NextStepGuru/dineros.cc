<script setup lang="ts">
import { registerEntryOrigin } from "~/lib/registerEntryOrigin";
import type { RegisterEntry } from "~/types/types";

const props = defineProps<{
  entry: RegisterEntry;
  todayISO: string;
}>();

const origin = computed(() => registerEntryOrigin(props.entry, props.todayISO));
</script>

<template lang="pug">
UTooltip(v-if="origin" :text="origin.label" :delay-duration="200")
  span(
    class="inline-flex shrink-0 items-center"
    role="img"
    :aria-label="origin.label")
    UIcon(:name="origin.icon" class="size-3.5 text-muted")
</template>
