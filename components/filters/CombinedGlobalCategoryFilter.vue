<script setup lang="ts">
import { CATEGORY_FILTER_ALL } from "~/lib/categoryFilter";

export type CategoryFilterMenuItem = {
  label: string;
  value: string;
  name: string;
};

const globalFilter = defineModel<string>("globalFilter", { default: "" });
const categoryFilter = defineModel<string>("categoryFilter", { default: "" });

const props = withDefaults(
  defineProps<{
    categoryItems: CategoryFilterMenuItem[];
    filterInputId?: string;
    inputClass?: string;
    menuClass?: string;
  }>(),
  {
    filterInputId: "search",
    inputClass: "min-w-32 max-w-48 grow",
    menuClass: "min-w-40 max-w-[16rem]",
  },
);

const expanded = ref(false);

function collapse() {
  expanded.value = false;
}

function resetAndCollapse() {
  globalFilter.value = "";
  categoryFilter.value = CATEGORY_FILTER_ALL;
  expanded.value = false;
}

async function expandAndFocus() {
  expanded.value = true;
  await nextTick();
  document.getElementById(props.filterInputId)?.focus();
}

defineExpose({
  collapse,
  expandAndFocus,
  resetAndCollapse,
});
</script>

<template>
  <div class="flex flex-wrap xl:flex-nowrap items-center gap-1 min-w-0">
    <template v-if="!expanded">
      <UTooltip text="Table filters" :delay-duration="150">
        <UButton
          variant="soft"
          size="sm"
          square
          icon="i-lucide-sliders-horizontal"
          title="Table filters"
          aria-label="Open table filters"
          aria-expanded="false"
          @click="expandAndFocus()"
        />
      </UTooltip>
    </template>
    <template v-else>
      <UInput
        :id="props.filterInputId"
        v-model="globalFilter"
        size="sm"
        :class="props.inputClass"
        placeholder="Filter..."
        aria-label="Filter table by text"
      />
      <UTooltip text="Filter by category" :delay-duration="150">
        <USelectMenu
          v-model="categoryFilter"
          :items="props.categoryItems"
          value-key="value"
          label-key="label"
          :filter-fields="['label', 'name']"
          size="sm"
          :class="props.menuClass"
          placeholder="All categories"
          search-placeholder="Search…"
          aria-label="Filter by category"
        />
      </UTooltip>
      <UTooltip text="Reset filters" :delay-duration="150">
        <UButton
          variant="soft"
          size="sm"
          square
          icon="i-lucide-x"
          title="Reset filters"
          aria-label="Reset filters"
          @click="resetAndCollapse()"
        />
      </UTooltip>
    </template>
  </div>
</template>
