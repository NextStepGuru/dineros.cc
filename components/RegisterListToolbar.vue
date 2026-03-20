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
  }>(),
  {
    showAdd: true,
    showRefresh: true,
    refreshLoading: false,
    filterClass: "min-w-[8rem] max-w-48",
    filterInputId: "search",
  },
);

const emit = defineEmits<{
  add: [];
  refresh: [];
}>();
</script>

<template>
  <div class="w-full min-w-0 flex flex-wrap xl:flex-nowrap gap-1 items-center">
    <UTooltip v-if="showAdd" text="Add entry" :delay-duration="150">
      <UButton
        color="primary"
        size="sm"
        square
        icon="i-lucide-plus"
        title="Add entry"
        aria-label="Add entry"
        @click="emit('add')"
      />
    </UTooltip>
    <UTooltip v-if="showRefresh" text="Refresh register" :delay-duration="150">
      <UButton
        color="success"
        size="sm"
        square
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
      <UButton
        variant="soft"
        size="sm"
        square
        icon="i-lucide-keyboard"
        :color="showShortcuts ? 'primary' : 'neutral'"
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
        placeholder="Filter..."
      />
    </slot>
    <slot name="trailing" />
  </div>
</template>
