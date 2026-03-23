<script setup lang="ts">
const globalFilter = defineModel<string>("globalFilter", { default: "" });
const showShortcuts = defineModel<boolean>("showShortcuts", { default: false });

withDefaults(
  defineProps<{
    showAdd?: boolean;
    /** Register page refreshes entries; accounts page omits this. */
    showRefresh?: boolean;
    refreshLoading?: boolean;
    /** Tailwind classes for the filter input width */
    filterClass?: string;
    filterInputId?: string;
    filterPlaceholder?: string;
    addTooltip?: string;
    addTitle?: string;
    addAriaLabel?: string;
  }>(),
  {
    showAdd: true,
    showRefresh: true,
    refreshLoading: false,
    filterClass: "min-w-[8rem] max-w-48",
    filterInputId: "search",
    filterPlaceholder: "Filter...",
    addTooltip: "Add entry",
    addTitle: "Add entry",
    addAriaLabel: "Add entry",
  },
);

const emit = defineEmits<{
  add: [];
  refresh: [];
}>();
</script>

<template>
  <div aria-label="List actions" class="w-full min-w-0 flex flex-wrap xl:flex-nowrap gap-1 items-center">
    <UTooltip v-if="showAdd" :text="addTooltip" :delay-duration="150">
      <BaseIconButton
        icon="i-lucide-plus"
        :title="addTitle"
        :aria-label="addAriaLabel"
        @click="emit('add')"
      />
    </UTooltip>
    <UTooltip v-if="showRefresh" text="Refresh register" :delay-duration="150">
      <BaseIconButton
        icon="i-lucide-refresh-cw"
        title="Refresh register"
        aria-label="Refresh register"
        :loading="refreshLoading"
        @click="emit('refresh')"
      />
    </UTooltip>
    <slot name="middle" />
    <UTooltip
      :text="showShortcuts ? 'Hide shortcuts' : 'Show shortcuts'"
      :delay-duration="150"
    >
      <BaseIconButton
        icon="i-lucide-keyboard"
        :active="showShortcuts"
        :title="showShortcuts ? 'Hide shortcuts' : 'Show shortcuts'"
        :aria-label="showShortcuts ? 'Hide shortcuts' : 'Show shortcuts'"
        @click="showShortcuts = !showShortcuts"
      />
    </UTooltip>
    <slot name="filter">
      <UInput
        :id="filterInputId"
        v-model="globalFilter"
        size="sm"
        :class="filterClass"
        :placeholder="filterPlaceholder"
        aria-label="Filter list"
      />
    </slot>
    <slot name="trailing" />
  </div>
</template>
