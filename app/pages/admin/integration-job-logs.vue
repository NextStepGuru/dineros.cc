<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "admin"],
});

const $api = useNuxtApp().$api as typeof $fetch;
const toast = useToast();

type Row = {
  id: string;
  createdAt: string;
  source: string;
  queueName: string;
  jobId: string | null;
  message: string;
  itemId: string | null;
  metadata: unknown;
};

const limit = 50;
const offset = ref(0);
const total = ref(0);
const loading = ref(false);
const items = ref<Row[]>([]);
const sourceFilter = ref("");
const expandedId = ref<string | null>(null);

async function load(reset: boolean) {
  loading.value = true;
  if (reset) offset.value = 0;
  try {
    const query: Record<string, string | number> = {
      limit,
      offset: reset ? 0 : offset.value,
    };
    if (sourceFilter.value.trim()) query.source = sourceFilter.value.trim();

    const res = await $api<{
      items: Row[];
      total: number;
    }>("/api/admin/integration-job-logs", { query });

    total.value = res.total;
    if (reset) {
      items.value = res.items;
    } else {
      items.value = [...items.value, ...res.items];
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to load job logs.";
    toast.add({ color: "error", description: message });
  } finally {
    loading.value = false;
  }
}

function loadMore() {
  offset.value += limit;
  load(false);
}

function toggleMeta(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

function formatJson(v: unknown) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

onMounted(() => {
  load(true);
});

useHead({
  title: "Admin integration job logs",
  meta: [
    {
      name: "description",
      content: "Background job failures (e.g. Plaid sync).",
    },
  ],
});
</script>

<template lang="pug">
AdminPageShell(
  title="Integration job logs"
  description="Append-only failures from background queues (e.g. Plaid sync).")
  div(class="space-y-4")
    div(class="flex flex-wrap items-end gap-3")
      UFormField(label="Source contains")
        UInput(v-model="sourceFilter" placeholder="plaid" class="min-w-[120px]")
      UButton(color="primary" :loading="loading" @click="load(true)") Apply

    p(class="text-sm frog-text-muted")
      | Showing {{ items.length }} of {{ total }}.

    div(class="overflow-x-auto rounded-lg border border-default")
      table(class="w-full text-sm")
        thead(class="bg-elevated")
          tr
            th(class="p-2 text-left") Time
            th(class="p-2 text-left") Source
            th(class="p-2 text-left") Queue
            th(class="p-2 text-left") Job
            th(class="p-2 text-left") Item
            th(class="p-2 text-left") Message
            th(class="p-2 text-left") Meta
        tbody
          template(v-for="row in items" :key="row.id")
            tr(class="border-t border-default align-top")
              td(class="p-2 whitespace-nowrap") {{ new Date(row.createdAt).toLocaleString() }}
              td(class="p-2") {{ row.source }}
              td(class="p-2 font-mono text-xs") {{ row.queueName }}
              td(class="p-2 font-mono text-xs break-all") {{ row.jobId ?? "—" }}
              td(class="p-2 font-mono text-xs break-all") {{ row.itemId ?? "—" }}
              td(class="p-2 max-w-md break-words") {{ row.message }}
              td(class="p-2")
                UButton(
                  v-if="row.metadata != null"
                  size="xs"
                  variant="soft"
                  @click="toggleMeta(row.id)") {{ expandedId === row.id ? "Hide" : "Show" }}
                span(v-else) —
            tr(v-if="expandedId === row.id && row.metadata != null")
              td(colspan="7" class="p-3 bg-elevated/30")
                pre(class="text-xs whitespace-pre-wrap break-all max-h-48 overflow-auto") {{ formatJson(row.metadata) }}

    div(class="flex justify-end")
      UButton(
        v-if="items.length < total"
        :loading="loading"
        :disabled="loading"
        @click="loadMore") Load more
</template>
