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
.table-wrap.overflow-x-auto
  table.w-full.text-sm
    thead
      tr.border-b.border-default.text-left
        th(class="py-2 pr-4 font-medium") Category
        th(class="py-2 pr-4 text-right font-medium") Total
        th(class="py-2 pr-4 text-right font-medium") % of activity
        th(class="py-2 text-right font-medium") #
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
