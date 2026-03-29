<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "admin"],
});

const route = useRoute();
const router = useRouter();
const $api = useNuxtApp().$api as typeof $fetch;
const toast = useToast();

type AuditRow = {
  id: number;
  adminUserId: number;
  action: string;
  targetUserId: number | null;
  targetAccountId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

const limit = 50;
const offset = ref(0);
const total = ref(0);
const loading = ref(false);
const items = ref<AuditRow[]>([]);

const filters = reactive({
  action: "",
  adminUserId: "",
  targetUserId: "",
});

function applyRouteQuery() {
  const a = route.query.action;
  if (typeof a === "string") filters.action = a;
  const au = route.query.adminUserId;
  if (typeof au === "string") filters.adminUserId = au;
  const tu = route.query.targetUserId;
  if (typeof tu === "string") filters.targetUserId = tu;
}

async function load(reset: boolean) {
  loading.value = true;
  if (reset) offset.value = 0;
  try {
    const query: Record<string, string | number> = {
      limit,
      offset: reset ? 0 : offset.value,
      format: "json",
    };
    if (filters.action.trim()) query.action = filters.action.trim();
    if (filters.adminUserId.trim()) {
      query.adminUserId = Number.parseInt(filters.adminUserId, 10);
    }
    if (filters.targetUserId.trim()) {
      query.targetUserId = Number.parseInt(filters.targetUserId, 10);
    }

    const res = await $api<{
      items: AuditRow[];
      total: number;
    }>("/api/admin/audit-logs", { query });

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
        : "Failed to load audit log.";
    toast.add({ color: "error", description: message });
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  void router.replace({
    query: {
      ...(filters.action.trim() ? { action: filters.action.trim() } : {}),
      ...(filters.adminUserId.trim()
        ? { adminUserId: filters.adminUserId.trim() }
        : {}),
      ...(filters.targetUserId.trim()
        ? { targetUserId: filters.targetUserId.trim() }
        : {}),
    },
  });
  load(true);
}

function exportCsv() {
  const params = new URLSearchParams();
  params.set("format", "csv");
  if (filters.action.trim()) params.set("action", filters.action.trim());
  if (filters.adminUserId.trim())
    params.set("adminUserId", filters.adminUserId.trim());
  if (filters.targetUserId.trim())
    params.set("targetUserId", filters.targetUserId.trim());
  window.open(`/api/admin/audit-logs?${params.toString()}`, "_blank");
}

function loadMore() {
  offset.value += limit;
  load(false);
}

onMounted(() => {
  applyRouteQuery();
  load(true);
});

useHead({
  title: "Admin audit log",
  meta: [
    {
      name: "description",
      content: "Admin action audit trail.",
    },
  ],
});
</script>

<template lang="pug">
AdminPageShell(
  title="Audit log"
  description="Recent admin actions (user updates, password resets, account jobs).")
  div(class="space-y-4")
    div(class="flex flex-wrap items-end gap-3")
      UFormField(label="Action contains")
        UInput(v-model="filters.action" class="min-w-[160px]")
      UFormField(label="Admin user ID")
        UInput(v-model="filters.adminUserId" type="number" class="w-28")
      UFormField(label="Target user ID")
        UInput(v-model="filters.targetUserId" type="number" class="w-28")
      UButton(color="primary" :loading="loading" @click="applyFilters") Apply
      UButton(variant="outline" @click="exportCsv") Export CSV

    p(class="text-sm frog-text-muted")
      | Showing {{ items.length }} of {{ total }} entries.

    div(class="overflow-x-auto rounded-lg border border-default")
      table(class="w-full text-sm")
        thead(class="bg-elevated")
          tr
            th(class="p-2 text-left") Time
            th(class="p-2 text-left") Admin user
            th(class="p-2 text-left") Action
            th(class="p-2 text-left") Target user
            th(class="p-2 text-left") Target account
            th(class="p-2 text-left") Details
        tbody
          tr(
            v-for="row in items"
            :key="row.id"
            class="border-t border-default align-top")
            td(class="p-2 whitespace-nowrap") {{ new Date(row.createdAt).toLocaleString() }}
            td(class="p-2") {{ row.adminUserId }}
            td(class="p-2 font-mono text-xs") {{ row.action }}
            td(class="p-2") {{ row.targetUserId ?? "—" }}
            td(class="p-2 font-mono text-xs break-all") {{ row.targetAccountId ?? "—" }}
            td(class="p-2 max-w-xs")
              pre(class="text-xs whitespace-pre-wrap break-all text-left") {{ row.metadata ? JSON.stringify(row.metadata, null, 2) : "—" }}

    div(class="flex justify-end")
      UButton(
        v-if="items.length < total"
        :loading="loading"
        :disabled="loading"
        @click="loadMore") Load more
</template>
