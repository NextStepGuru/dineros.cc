<script setup lang="ts">
import type { CategoryReportRow } from "~/server/services/reports/types";

const props = defineProps<{
  categories: CategoryReportRow[];
  currencyFmt: Intl.NumberFormat;
}>();

const segments = computed(() => {
  return props.categories.filter((c) => c.shareOfAbs > 0);
});

const gradientStyle = computed(() => {
  const segs = segments.value;
  if (segs.length === 0) return {};

  let pct = 0;
  const parts: string[] = [];
  for (const c of segs) {
    const p = c.shareOfAbs;
    parts.push(`${c.color} ${pct}% ${pct + p}%`);
    pct += p;
  }
  if (pct < 100 && segs.length > 0) {
    const last = segs[segs.length - 1]!;
    parts.push(`${last.color} ${pct}% 100%`);
  }
  return {
    background: `conic-gradient(${parts.join(", ")})`,
  };
});

const hasData = computed(() => segments.value.length > 0);

const legendUsesTwoColumns = computed(() => segments.value.length > 5);

const legendListClass = computed(() => {
  const base = "list-none min-w-0 flex-1";
  if (legendUsesTwoColumns.value) {
    return `${base} grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2`;
  }
  return `${base} flex flex-col gap-2`;
});
</script>

<template lang="pug">
.flex.flex-col(class="md:flex-row md:items-start gap-8")
  .flex.flex-col.items-center.gap-2
    //- 13rem (w-52) × 1.2 — ring hole scaled to match
    .relative.rounded-full(class="size-[15.6rem] shrink-0")
      .rounded-full.w-full.h-full.transition-opacity(
        class="ring-1 ring-default"
        :style="gradientStyle"
        :class="hasData ? 'opacity-100' : 'opacity-20'")
      .absolute.rounded-full.bg-default(class="inset-[2.4rem] ring-1 ring-default")
    p.text-sm.frog-text-muted(v-if="!hasData") No activity to chart for this range.

  ul(:class="legendListClass" aria-label="Category breakdown")
    li.flex.items-start.gap-2.min-w-0(
      v-for="(c, idx) in segments"
      :key="`${c.categoryId ?? 'uncategorized'}-${idx}`")
      span.rounded-full.shrink-0(class="w-3 h-3" :style="{ background: c.color }")
      .flex.flex-col.min-w-0.flex-1
        span.font-medium.truncate {{ c.segmentLabel }}
        span.text-sm.frog-text-muted
          | {{ currencyFmt.format(c.total) }} · {{ c.shareOfAbs.toFixed(1) }}%
</template>
