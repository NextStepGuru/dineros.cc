<script setup lang="ts">
const toast = useToast();
const authStore = useAuthStore();

if (authStore.getUser?.isAdmin !== true) {
  throw createError({
    statusCode: 403,
    statusMessage: "Access Denied",
  });
}

type LogRow = {
  id: string;
  createdAt: string;
  purpose: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cachedPromptTokens: number | null;
  durationMs: number;
  success: boolean;
  errorMessage: string | null;
  httpStatus: number | null;
  metadata: unknown;
};

const limit = 25;
const offset = ref(0);
const total = ref(0);
const items = ref<LogRow[]>([]);
const loading = ref(false);
const expandedId = ref<string | null>(null);

async function load(reset: boolean) {
  if (reset) {
    offset.value = 0;
    items.value = [];
  }
  loading.value = true;
  try {
    const { data, error } = await useAPI<{
      items: LogRow[];
      total: number;
      limit: number;
      offset: number;
    }>("/api/admin/openai-request-logs", {
      query: { limit, offset: offset.value },
    });
    if (error.value) {
      toast.add({
        color: "error",
        description: error.value.message || "Failed to load logs",
      });
      return;
    }
    if (data.value) {
      total.value = data.value.total;
      if (reset) {
        items.value = data.value.items;
      } else {
        items.value = [...items.value, ...data.value.items];
      }
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load(true);
});

function loadMore() {
  offset.value += limit;
  load(false);
}

function toggleMeta(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

function formatJson(meta: unknown) {
  try {
    return JSON.stringify(meta, null, 2);
  } catch {
    return String(meta);
  }
}
</script>

<template lang="pug">
div(class="max-w-5xl min-h-96 my-4 m-auto px-2")
  h2(class="text-xl font-bold text-center mb-4") OpenAI request logs

  p(class="text-sm text-gray-500 text-center mb-4")
    | Usage rows from Plaid enrichment and other logged completions. Showing {{ items.length }} of {{ total }}.

  div(v-if="loading && items.length === 0" class="text-center py-8") Loading…

  div(v-else class="overflow-x-auto border rounded-lg")
    table(class="w-full text-sm text-left")
      thead(class="bg-gray-100 dark:bg-gray-800")
        tr
          th(class="p-2") Time
          th(class="p-2") Purpose
          th(class="p-2") Model
          th(class="p-2") In
          th(class="p-2") Out
          th(class="p-2") Total
          th(class="p-2") Cached
          th(class="p-2") ms
          th(class="p-2") OK
          th(class="p-2") Error
          th(class="p-2") Meta
      tbody
        template(v-for="row in items" :key="row.id")
          tr(class="border-t border-gray-200 dark:border-gray-700 align-top")
            td(class="p-2 whitespace-nowrap") {{ new Date(row.createdAt).toLocaleString() }}
            td(class="p-2") {{ row.purpose }}
            td(class="p-2 max-w-[120px] truncate") {{ row.model }}
            td(class="p-2") {{ row.promptTokens ?? "—" }}
            td(class="p-2") {{ row.completionTokens ?? "—" }}
            td(class="p-2") {{ row.totalTokens ?? "—" }}
            td(class="p-2") {{ row.cachedPromptTokens ?? "—" }}
            td(class="p-2") {{ row.durationMs }}
            td(class="p-2") {{ row.success ? "yes" : "no" }}
            td(class="p-2 max-w-[200px] wrap-break-word text-red-600 dark:text-red-400") {{ row.errorMessage || "—" }}
            td(class="p-2")
              UButton(
                v-if="row.metadata != null"
                size="xs"
                variant="ghost"
                @click="toggleMeta(row.id)"
              ) {{ expandedId === row.id ? "Hide" : "Show" }}
              span(v-else) —
          tr(v-if="expandedId === row.id && row.metadata != null")
            td(colspan="11" class="p-2 bg-gray-50 dark:bg-gray-900")
              pre(class="text-xs overflow-x-auto whitespace-pre-wrap") {{ formatJson(row.metadata) }}

  div(class="flex justify-center gap-4 mt-6")
    UButton(
      @click="load(true)"
      :loading="loading"
      variant="outline"
    ) Refresh
    UButton(
      v-if="items.length < total"
      @click="loadMore"
      :loading="loading"
      :disabled="loading"
    ) Load more
</template>
