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
    /** When false, only the text filter is shown (same chrome as category mode: sliders → search + reset). */
    showCategoryFilter?: boolean;
    filterInputId?: string;
    inputClass?: string;
    menuClass?: string;
  }>(),
  {
    showCategoryFilter: true,
    filterInputId: "search",
    inputClass: "min-w-32 max-w-48 grow",
    menuClass: "min-w-40 max-w-[16rem]",
  },
);

/** True after opening via the sliders control until cleared, blurred out, or all filters are empty. */
const manuallyExpanded = ref(false);

/** True while focus is in the search input, category menu, or reset control (incl. portaled menus). */
const focusInsideExpandedChrome = ref(false);

const expandedChromeRef = ref<HTMLElement | null>(null);

const hasActiveFilter = computed(
  () =>
    globalFilter.value.trim().length > 0 ||
    categoryFilter.value !== CATEGORY_FILTER_ALL,
);

const expanded = computed(
  () =>
    hasActiveFilter.value ||
    manuallyExpanded.value ||
    focusInsideExpandedChrome.value,
);

function focusInPortaledOverlay(el: Element | null): boolean {
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(
    el.closest('[role="listbox"]') ||
      el.closest('[role="menu"]') ||
      el.closest("[data-reka-popper-content-wrapper]"),
  );
}

function focusStillInFilterChrome(active: Element | null): boolean {
  const root = expandedChromeRef.value;
  if (!active || !root) return false;
  if (root.contains(active)) return true;
  return focusInPortaledOverlay(active);
}

function onExpandedChromeFocusIn() {
  focusInsideExpandedChrome.value = true;
}

function onExpandedChromeFocusOut() {
  requestAnimationFrame(() => {
    const ae = document.activeElement;
    if (focusStillInFilterChrome(ae)) return;
    focusInsideExpandedChrome.value = false;
    if (!hasActiveFilter.value) {
      manuallyExpanded.value = false;
    }
  });
}

watch(hasActiveFilter, (active, wasActive) => {
  if (wasActive && !active && !focusInsideExpandedChrome.value) {
    manuallyExpanded.value = false;
  }
});

function blurFilterInputIfFocused() {
  const el = document.getElementById(props.filterInputId);
  if (el && document.activeElement === el) {
    (el as HTMLElement).blur();
  }
}

function collapse() {
  manuallyExpanded.value = false;
  focusInsideExpandedChrome.value = false;
  blurFilterInputIfFocused();
}

function resetAndCollapse() {
  globalFilter.value = "";
  categoryFilter.value = CATEGORY_FILTER_ALL;
  manuallyExpanded.value = false;
  focusInsideExpandedChrome.value = false;
  blurFilterInputIfFocused();
}

async function expandAndFocus() {
  manuallyExpanded.value = true;
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
        <BaseIconButton
          icon="i-lucide-sliders-horizontal"
          title="Table filters"
          aria-label="Open table filters"
          :aria-expanded="expanded"
          @click="expandAndFocus()"
        />
      </UTooltip>
    </template>
    <template v-else>
      <div
        ref="expandedChromeRef"
        class="flex flex-wrap xl:flex-nowrap items-center gap-1 min-w-0"
        @focusin="onExpandedChromeFocusIn"
        @focusout="onExpandedChromeFocusOut"
      >
        <UInput
          :id="props.filterInputId"
          v-model="globalFilter"
          size="sm"
          :class="props.inputClass"
          placeholder="Filter..."
          aria-label="Filter table by text"
        />
        <UTooltip
          v-if="showCategoryFilter"
          text="Filter by category"
          :delay-duration="150"
        >
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
          <BaseIconButton
            icon="i-lucide-x"
            title="Reset filters"
            aria-label="Reset filters"
            @click="resetAndCollapse()"
          />
        </UTooltip>
      </div>
    </template>
  </div>
</template>
