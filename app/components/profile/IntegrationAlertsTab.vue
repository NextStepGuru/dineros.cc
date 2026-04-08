<script setup lang="ts">
const toast = useToast();
const route = useRoute();
const { isAdminConsoleUser } = useAdminAccess();

if (!isAdminConsoleUser.value) {
  throw createError({
    statusCode: 403,
    statusMessage: "Access Denied",
  });
}

type LogRow = {
  id: string;
  createdAt: string;
  source: string;
  kind: string;
  message: string;
  httpStatus: number | null;
  details: unknown;
  dedupeKey: string | null;
};

const limit = 25;
const offset = ref(0);
const total = ref(0);
const items = ref<LogRow[]>([]);
const loading = ref(false);
const expandedId = ref<string | null>(null);
const sourceFilter = ref<"all" | "plaid" | "openai">("all");
const kindFilter = ref("");
const fromFilter = ref("");
const toFilter = ref("");

function applyRouteQuery() {
  const s = route.query.source;
  if (s === "plaid" || s === "openai" || s === "all") {
    sourceFilter.value = s;
  }
}

function buildQuery(resetOffset: boolean) {
  const q: Record<string, string | number> = {
    limit,
    offset: resetOffset ? 0 : offset.value,
    source: sourceFilter.value,
    format: "json",
  };
  if (kindFilter.value.trim()) q.kind = kindFilter.value.trim();
  if (fromFilter.value.trim()) q.from = fromFilter.value.trim();
  if (toFilter.value.trim()) q.to = toFilter.value.trim();
  return q;
}

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
    }>("/api/admin/integration-alerts", {
      query: buildQuery(reset),
    });
    if (error.value) {
      toast.add({
        color: "error",
        description: error.value.message || "Failed to load alerts",
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

function applyFilters() {
  load(true);
}

function exportCsv() {
  const params = new URLSearchParams();
  params.set("format", "csv");
  params.set("source", sourceFilter.value);
  if (kindFilter.value.trim()) params.set("kind", kindFilter.value.trim());
  if (fromFilter.value.trim()) params.set("from", fromFilter.value.trim());
  if (toFilter.value.trim()) params.set("to", toFilter.value.trim());
  window.open(
    `/api/admin/integration-alerts?${params.toString()}`,
    "_blank",
    "noopener,noreferrer",
  );
}

watch(
  sourceFilter,
  () => {
    load(true);
  },
  { flush: "sync" },
);

onMounted(() => {
  const prev = sourceFilter.value;
  applyRouteQuery();
  if (sourceFilter.value === prev) {
    load(true);
  }
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
div(class="max-w-5xl mx-auto px-2")

  div(class="flex flex-wrap items-end gap-3 mb-4")
    UFormField(label="Source" for="ia-source")
      select#ia-source(
        v-model="sourceFilter"
        autocomplete="off"
        class="block min-w-[160px] rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
      )
        option(value="all") All sources
        option(value="plaid") Plaid
        option(value="openai") OpenAI
    UFormField(label="Kind contains" for="ia-kind")
      UInput#ia-kind(v-model="kindFilter" placeholder="credential" class="min-w-[120px]")
    UFormField(label="From (ISO)" for="ia-from")
      UInput#ia-from(v-model="fromFilter" class="min-w-[180px]")
    UFormField(label="To (ISO)" for="ia-to")
      UInput#ia-to(v-model="toFilter" class="min-w-[180px]")
    UButton(color="primary" :loading="loading" @click="applyFilters") Apply
    UButton(variant="outline" @click="exportCsv") Export CSV

  p(class="text-sm text-gray-500 mb-4")
    | Plaid and OpenAI credential alerts (also emailed to ops when configured). Showing {{ items.length }} of {{ total }}.

  div(v-if="loading && items.length === 0" class="text-center py-8") Loading…

  div(v-else class="overflow-x-auto border rounded-lg")
    table(class="w-full text-sm text-left")
      thead(class="bg-gray-100 dark:bg-gray-800")
        tr
          th(class="p-2") Time
          th(class="p-2") Source
          th(class="p-2") Kind
          th(class="p-2") Message
          th(class="p-2") HTTP
          th(class="p-2") Details
      tbody
        template(v-for="row in items" :key="row.id")
          tr(class="border-t border-gray-200 dark:border-gray-700 align-top")
            td(class="p-2 whitespace-nowrap") {{ new Date(row.createdAt).toLocaleString() }}
            td(class="p-2") {{ row.source }}
            td(class="p-2") {{ row.kind }}
            td(class="p-2 max-w-[280px] wrap-break-word") {{ row.message }}
            td(class="p-2") {{ row.httpStatus ?? "—" }}
            td(class="p-2")
              UButton(
                v-if="row.details != null"
                size="xs"
                variant="ghost"
                @click="toggleMeta(row.id)"
              ) {{ expandedId === row.id ? "Hide" : "Show" }}
              span(v-else) —
          tr(v-if="expandedId === row.id && row.details != null")
            td(colspan="6" class="p-2 bg-gray-50 dark:bg-gray-900")
              pre(class="text-xs overflow-x-auto whitespace-pre-wrap") {{ formatJson(row.details) }}

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
