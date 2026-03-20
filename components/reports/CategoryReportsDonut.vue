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
</script>

<template lang="pug">
.flex.flex-col(class="md:flex-row md:items-start gap-8")
  .flex.flex-col.items-center.gap-2
    .relative.rounded-full(class="w-52 h-52 shrink-0")
      .rounded-full.w-full.h-full.transition-opacity(
        class="ring-1 ring-default"
        :style="gradientStyle"
        :class="hasData ? 'opacity-100' : 'opacity-20'")
      .absolute.rounded-full.bg-default(class="inset-8 ring-1 ring-default")
    p.text-sm.frog-text-muted(v-if="!hasData") No activity to chart for this range.

  ul.list-none(class="flex flex-col gap-2 min-w-0 flex-1" aria-label="Category breakdown")
    li.flex.items-center.gap-2.min-w-0(
      v-for="c in segments"
      :key="c.categoryId ?? 'uncategorized'")
      span.rounded-full.shrink-0(class="w-3 h-3" :style="{ background: c.color }")
      .flex.flex-col.min-w-0.flex-1
        span.font-medium.truncate {{ c.segmentLabel }}
        span.text-sm.frog-text-muted
          | {{ currencyFmt.format(c.total) }} · {{ c.shareOfAbs.toFixed(1) }}%
</template>
