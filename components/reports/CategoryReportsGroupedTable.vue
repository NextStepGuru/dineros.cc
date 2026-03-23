<script setup lang="ts">
import type { CategoryReportTableGroup } from "~/server/services/reports/types";

defineProps<{
  groups: CategoryReportTableGroup[];
}>();
</script>

<template lang="pug">
.table-wrap(
  class="relative overflow-auto w-full max-h-[min(65dvh,calc(100dvh-var(--ui-header-height)-12rem))] overscroll-y-contain"
)
  table(class="w-full min-w-full text-xs sm:text-sm border-separate border-spacing-0")
    caption(class="sr-only") Category spending breakdown
    thead(
      class="[&>tr]:relative [&>tr]:after:absolute [&>tr]:after:inset-x-0 [&>tr]:after:bottom-0 [&>tr]:after:h-px [&>tr]:after:bg-(--ui-border-accented)"
    )
      tr(class="frog-surface-elevated")
        th(
          scope="col"
          class="sticky top-0 z-20 bg-default backdrop-blur-sm px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-highlighted text-left rtl:text-right font-semibold"
        ) Category
        th(
          scope="col"
          class="sticky top-0 z-20 bg-default backdrop-blur-sm px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-highlighted text-right font-semibold whitespace-nowrap"
        ) Total
        th(
          scope="col"
          class="sticky top-0 z-20 bg-default backdrop-blur-sm px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-highlighted text-right font-semibold whitespace-nowrap"
        ) % of activity
        th(
          scope="col"
          class="sticky top-0 z-20 bg-default backdrop-blur-sm px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-highlighted text-right font-semibold whitespace-nowrap"
        ) Count
    tbody(class="w-full relative")
      template(v-for="g in groups" :key="String(g.parent.categoryId ?? 'uncategorized')")
        tr(class="border-b border-default bg-elevated/25")
          td(class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap")
            .flex.items-center.gap-2.min-w-0
              span.rounded-full.shrink-0(class="w-2.5 h-2.5" :style="{ background: g.parent.color }")
              span.font-semibold.frog-text.truncate {{ g.parent.name }}
          td(class="p-2 sm:p-4 text-xs sm:text-sm text-right tabular-nums whitespace-nowrap")
            DollarFormat(:amount="g.parent.total")
          td(class="p-2 sm:p-4 text-xs sm:text-sm text-right tabular-nums text-muted whitespace-nowrap") {{ g.parent.shareOfAbs.toFixed(1) }}%
          td(class="p-2 sm:p-4 text-xs sm:text-sm text-right tabular-nums text-muted whitespace-nowrap") {{ g.parent.count }}
        tr(
          v-for="c in g.children"
          :key="c.categoryId"
          class="border-b border-default/50")
          td(class="p-2 sm:p-4 pl-4 sm:pl-8 text-xs sm:text-sm text-muted whitespace-nowrap")
            .flex.items-center.gap-2.min-w-0
              span.rounded-full.shrink-0(class="w-2 h-2 opacity-90" :style="{ background: c.color }")
              span.truncate {{ c.name }}
          td(class="p-2 sm:p-4 text-xs sm:text-sm text-right tabular-nums whitespace-nowrap")
            DollarFormat(:amount="c.total")
          td(class="p-2 sm:p-4 text-xs sm:text-sm text-right tabular-nums text-muted whitespace-nowrap") {{ c.shareOfAbs.toFixed(1) }}%
          td(class="p-2 sm:p-4 text-xs sm:text-sm text-right tabular-nums text-muted whitespace-nowrap") {{ c.count }}
</template>
