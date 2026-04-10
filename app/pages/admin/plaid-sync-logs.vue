<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "admin"],
});

const $api = useNuxtApp().$api as typeof $fetch;
const toast = useToast();

type Row = {
  id: string;
  createdAt: string;
  syncMode: string;
  status: string;
  itemId: string | null;
  userId: number | null;
  durationMs: number | null;
  txAdded: number;
  txModified: number;
  txRemoved: number;
  newEntries: number;
  matchedEntries: number;
  errorCount: number;
  errorSummary: string | null;
  metadata: unknown;
};

const limit = 50;
const offset = ref(0);
const total = ref(0);
const loading = ref(false);
const items = ref<Row[]>([]);
const syncModeFilter = ref<"" | "item_cursor" | "legacy_token_batch">("");
const statusFilter = ref<"" | "success" | "partial" | "failed">("");
const userIdFilter = ref("");
const expandedId = ref<string | null>(null);

function statusBadgeColor(
  status: string,
): "success" | "warning" | "error" | "neutral" {
  if (status === "success") return "success";
  if (status === "partial") return "warning";
  if (status === "failed") return "error";
  return "neutral";
}

function modeBadgeColor(
  mode: string,
): "primary" | "neutral" {
  return mode === "item_cursor" ? "primary" : "neutral";
}

async function load(reset: boolean) {
  loading.value = true;
  if (reset) offset.value = 0;
  try {
    const query: Record<string, string | number> = {
      limit,
      offset: reset ? 0 : offset.value,
    };
    if (syncModeFilter.value) query.syncMode = syncModeFilter.value;
    if (statusFilter.value) query.status = statusFilter.value;
    const uid = userIdFilter.value.trim();
    if (uid) {
      const n = Number.parseInt(uid, 10);
      if (Number.isFinite(n) && n > 0) query.userId = n;
    }

    const res = await $api<{
      items: Row[];
      total: number;
    }>("/api/admin/plaid-sync-logs", { query });

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
        : "Failed to load Plaid sync logs.";
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
  title: "Admin Plaid sync logs",
  meta: [
    {
      name: "description",
      content: "Per-run Plaid transaction sync outcomes.",
    },
  ],
});
</script>

<template lang="pug">
AdminPageShell(
  title="Plaid sync logs"
  description="Per-run outcomes from Plaid transaction sync (cursor and legacy batch).")
  div(class="space-y-4")
    div(class="flex flex-wrap items-end gap-3")
      UFormField(label="Sync mode")
        USelect(
          v-model="syncModeFilter"
          class="min-w-[160px]"
          :items="[
            { label: 'Any', value: '' },
            { label: 'item_cursor', value: 'item_cursor' },
            { label: 'legacy_token_batch', value: 'legacy_token_batch' },
          ]"
          value-key="value"
          label-key="label")
      UFormField(label="Status")
        USelect(
          v-model="statusFilter"
          class="min-w-[140px]"
          :items="[
            { label: 'Any', value: '' },
            { label: 'success', value: 'success' },
            { label: 'partial', value: 'partial' },
            { label: 'failed', value: 'failed' },
          ]"
          value-key="value"
          label-key="label")
      UFormField(label="User ID")
        UInput(v-model="userIdFilter" placeholder="optional" class="min-w-[100px]" type="number")
      UButton(color="primary" :loading="loading" @click="load(true)") Apply

    p(class="text-sm frog-text-muted")
      | Showing {{ items.length }} of {{ total }}.

    div(class="overflow-x-auto rounded-lg border border-default")
      table(class="w-full text-sm")
        thead(class="bg-elevated")
          tr
            th(class="p-2 text-left") Time
            th(class="p-2 text-left") Mode
            th(class="p-2 text-left") Status
            th(class="p-2 text-left") User
            th(class="p-2 text-left") Item
            th(class="p-2 text-left") Tx +/mod/−
            th(class="p-2 text-left") New / matched
            th(class="p-2 text-left") Err
            th(class="p-2 text-left") ms
            th(class="p-2 text-left") Meta
        tbody
          template(v-for="row in items" :key="row.id")
            tr(class="border-t border-default align-top")
              td(class="p-2 whitespace-nowrap") {{ new Date(row.createdAt).toLocaleString() }}
              td(class="p-2")
                UBadge(size="xs" :color="modeBadgeColor(row.syncMode)") {{ row.syncMode }}
              td(class="p-2")
                UBadge(size="xs" :color="statusBadgeColor(row.status)") {{ row.status }}
              td(class="p-2 font-mono text-xs") {{ row.userId ?? "—" }}
              td(class="p-2 font-mono text-xs break-all max-w-[140px]") {{ row.itemId ?? "—" }}
              td(class="p-2 font-mono text-xs whitespace-nowrap")
                | {{ row.txAdded }}/{{ row.txModified }}/{{ row.txRemoved }}
              td(class="p-2 font-mono text-xs whitespace-nowrap")
                | {{ row.newEntries }}/{{ row.matchedEntries }}
              td(class="p-2") {{ row.errorCount }}
              td(class="p-2 whitespace-nowrap") {{ row.durationMs ?? "—" }}
              td(class="p-2")
                UButton(
                  v-if="row.metadata != null || row.errorSummary"
                  size="xs"
                  variant="soft"
                  @click="toggleMeta(row.id)") {{ expandedId === row.id ? "Hide" : "Show" }}
                span(v-else) —
            tr(v-if="expandedId === row.id && (row.metadata != null || row.errorSummary)")
              td(colspan="10" class="p-3 bg-elevated/30")
                p(v-if="row.errorSummary" class="text-xs mb-2 whitespace-pre-wrap wrap-break-word") {{ row.errorSummary }}
                pre(v-if="row.metadata != null" class="text-xs whitespace-pre-wrap break-all max-h-48 overflow-auto") {{ formatJson(row.metadata) }}

    div(class="flex justify-end")
      UButton(
        v-if="items.length < total"
        :loading="loading"
        :disabled="loading"
        @click="loadMore") Load more
</template>
