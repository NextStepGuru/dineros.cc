<script setup lang="ts">
const globalFilter = defineModel<string>("globalFilter", { default: "" });
const showShortcuts = defineModel<boolean>("showShortcuts", { default: false });

withDefaults(
  defineProps<{
    /** Register page refreshes entries; accounts page omits this. */
    showRefresh?: boolean;
    refreshLoading?: boolean;
    /** Tailwind classes for the filter input width */
    filterClass?: string;
    filterInputId?: string;
  }>(),
  {
    showRefresh: true,
    refreshLoading: false,
    filterClass: "w-full md:max-w-48",
    filterInputId: "search",
  },
);

const emit = defineEmits<{
  add: [];
  refresh: [];
}>();
</script>

<template>
  <div class="w-full flex flex-wrap gap-2 items-center">
    <UButton color="info" size="sm" @click="emit('add')">Add</UButton>
    <UButton
      v-if="showRefresh"
      size="sm"
      :loading="refreshLoading"
      @click="emit('refresh')"
    >
      Refresh
    </UButton>
    <slot name="middle" />
    <UButton variant="soft" size="sm" @click="showShortcuts = !showShortcuts">
      {{ showShortcuts ? "Hide shortcuts" : "Shortcuts" }}
    </UButton>
    <UInput
      :id="filterInputId"
      v-model="globalFilter"
      size="sm"
      :class="filterClass"
      placeholder="Filter..."
    />
    <slot name="trailing" />
  </div>
</template>
