<script setup lang="ts">
import type { CategoryReportTableGroup } from "~/server/services/reports/types";

defineProps<{
  groups: CategoryReportTableGroup[];
  currencyFmt: Intl.NumberFormat;
}>();

function amtClass(v: number) {
  return v < 0 ? "text-red-600 dark:text-red-400" : "";
}
</script>

<template lang="pug">
.table-wrap(
  class="overflow-x-auto overflow-y-auto max-h-[min(65dvh,calc(100dvh-var(--ui-header-height)-12rem))] overscroll-y-contain rounded-md ring-1 ring-default/60"
)
  table.w-full.text-sm.border-separate.border-spacing-0
    thead
      tr.text-left
        th(
          class="sticky top-0 z-1 border-b border-default bg-default py-2 pr-4 text-left font-medium"
        ) Category
        th(
          class="sticky top-0 z-1 border-b border-default bg-default py-2 pr-4 text-right font-medium"
        ) Total
        th(
          class="sticky top-0 z-1 border-b border-default bg-default py-2 pr-4 text-right font-medium"
        ) % of activity
        th(
          class="sticky top-0 z-1 border-b border-default bg-default py-2 text-right font-medium"
        ) #
    tbody
      template(v-for="g in groups" :key="String(g.parent.categoryId ?? 'uncategorized')")
        tr.border-b.border-default(class="bg-elevated/25")
          td(class="py-2 pr-4")
            .flex.items-center.gap-2.min-w-0
              span.rounded-full.shrink-0(class="w-2.5 h-2.5" :style="{ background: g.parent.color }")
              span.font-semibold.truncate {{ g.parent.name }}
          td(
            class="py-2 pr-4 text-right tabular-nums"
            :class="amtClass(g.parent.total)") {{ currencyFmt.format(g.parent.total) }}
          td(class="py-2 pr-4 text-right tabular-nums") {{ g.parent.shareOfAbs.toFixed(1) }}%
          td(class="py-2 text-right tabular-nums") {{ g.parent.count }}
        tr(
          v-for="c in g.children"
          :key="c.categoryId"
          class="border-b border-default/50")
          td(class="py-1.5 pr-4 pl-6")
            .flex.items-center.gap-2.min-w-0
              span.rounded-full.shrink-0(class="w-2 h-2 opacity-90" :style="{ background: c.color }")
              span.text-muted.truncate {{ c.name }}
          td(
            class="py-1.5 pr-4 text-right tabular-nums"
            :class="amtClass(c.total)") {{ currencyFmt.format(c.total) }}
          td(class="py-1.5 pr-4 text-right tabular-nums") {{ c.shareOfAbs.toFixed(1) }}%
          td(class="py-1.5 text-right tabular-nums") {{ c.count }}
</template>
