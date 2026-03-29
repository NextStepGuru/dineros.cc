<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "admin"],
});

const route = useRoute();
const router = useRouter();
const toast = useToast();
const $api = useNuxtApp().$api as typeof $fetch;

type Row = {
  id: number;
  userId: number;
  budgetId: number;
  kind: string;
  fingerprint: string;
  occurrenceKey: string;
  isActive: boolean;
  payload: unknown;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  updatedAt: string;
  userEmail: string;
  budgetName: string;
};

const limit = 50;
const offset = ref(0);
const total = ref(0);
const loading = ref(false);
const items = ref<Row[]>([]);
const expandedId = ref<number | null>(null);

const filters = reactive({
  userId: "" as string,
  budgetId: "" as string,
  kind: "" as "" | "FORECAST_RISK" | "REOCCURRENCE_HEALTH",
  isActive: "all" as "all" | "true" | "false",
  from: "",
  to: "",
});

function applyRouteQuery() {
  const uid = route.query.userId;
  if (typeof uid === "string" && uid.trim()) {
    filters.userId = uid.trim();
  }
  const bid = route.query.budgetId;
  if (typeof bid === "string" && bid.trim()) {
    filters.budgetId = bid.trim();
  }
}

async function load(reset: boolean) {
  loading.value = true;
  if (reset) offset.value = 0;
  try {
    const query: Record<string, string | number> = {
      limit,
      offset: reset ? 0 : offset.value,
      isActive: filters.isActive,
    };
    if (filters.userId.trim()) {
      const n = Number.parseInt(filters.userId, 10);
      if (Number.isInteger(n) && n > 0) query.userId = n;
    }
    if (filters.budgetId.trim()) {
      const n = Number.parseInt(filters.budgetId, 10);
      if (Number.isInteger(n) && n > 0) query.budgetId = n;
    }
    if (filters.kind) query.kind = filters.kind;
    if (filters.from.trim()) query.from = filters.from.trim();
    if (filters.to.trim()) query.to = filters.to.trim();

    const res = await $api<{
      items: Row[];
      total: number;
    }>("/api/admin/notification-events", { query });

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
        : "Failed to load notification events.";
    toast.add({ color: "error", description: message });
  } finally {
    loading.value = false;
  }
}

function search() {
  void router.replace({
    query: {
      ...route.query,
      ...(filters.userId.trim() ? { userId: filters.userId.trim() } : {}),
      ...(filters.budgetId.trim() ? { budgetId: filters.budgetId.trim() } : {}),
    },
  });
  load(true);
}

function loadMore() {
  offset.value += limit;
  load(false);
}

function togglePayload(id: number) {
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
  applyRouteQuery();
  load(true);
});

useHead({
  title: "Admin notification events",
  meta: [
    {
      name: "description",
      content: "In-app notification engine events per user/budget.",
    },
  ],
});
</script>

<template lang="pug">
AdminPageShell(
  title="Notification events"
  description="Forecast and reoccurrence health notifications stored in the database.")
  div(class="space-y-4")
    div(class="flex flex-wrap items-end gap-3")
      UFormField(label="User ID" for="ne-user-id")
        UInput#ne-user-id(v-model="filters.userId" type="number" class="w-32")
      UFormField(label="Budget ID" for="ne-budget-id")
        UInput#ne-budget-id(v-model="filters.budgetId" type="number" class="w-32")
      UFormField(label="Kind" for="ne-kind")
        select#ne-kind(
          v-model="filters.kind"
          autocomplete="off"
          class="block w-full min-w-[200px] rounded-md border border-default bg-default px-3 py-2 text-sm text-default"
        )
          option(value="") Any
          option(value="FORECAST_RISK") FORECAST_RISK
          option(value="REOCCURRENCE_HEALTH") REOCCURRENCE_HEALTH
      UFormField(label="Active" for="ne-active")
        select#ne-active(
          v-model="filters.isActive"
          autocomplete="off"
          class="block w-full min-w-[140px] rounded-md border border-default bg-default px-3 py-2 text-sm text-default"
        )
          option(value="all") All
          option(value="true") Active
          option(value="false") Inactive
      UFormField(label="From (ISO)" for="ne-from")
        UInput#ne-from(v-model="filters.from" placeholder="2026-01-01T00:00:00.000Z" class="min-w-[200px]")
      UFormField(label="To (ISO)" for="ne-to")
        UInput#ne-to(v-model="filters.to" placeholder="2026-12-31T23:59:59.999Z" class="min-w-[200px]")
      UButton(color="primary" :loading="loading" @click="search") Apply

    p(class="text-sm frog-text-muted")
      | Showing {{ items.length }} of {{ total }}.

    div(class="overflow-x-auto rounded-lg border border-default")
      table(class="w-full text-sm")
        thead(class="bg-elevated")
          tr
            th(class="p-2 text-left") Last seen
            th(class="p-2 text-left") Kind
            th(class="p-2 text-left") User
            th(class="p-2 text-left") Budget
            th(class="p-2 text-left") Active
            th(class="p-2 text-left") Payload
        tbody
          template(v-for="row in items" :key="row.id")
            tr(class="border-t border-default align-top")
              td(class="p-2 whitespace-nowrap") {{ new Date(row.lastSeenAt).toLocaleString() }}
              td(class="p-2 font-mono text-xs") {{ row.kind }}
              td(class="p-2")
                div {{ row.userEmail }}
                div(class="text-xs frog-text-muted") ID {{ row.userId }}
              td(class="p-2")
                div {{ row.budgetName }}
                div(class="text-xs frog-text-muted") ID {{ row.budgetId }}
              td(class="p-2")
                UBadge(:color="row.isActive ? 'success' : 'neutral'" variant="subtle")
                  | {{ row.isActive ? 'Yes' : 'No' }}
              td(class="p-2")
                UButton(
                  size="xs"
                  variant="soft"
                  @click="togglePayload(row.id)") {{ expandedId === row.id ? 'Hide' : 'Show' }}
            tr(v-if="expandedId === row.id" class="border-t border-default bg-elevated/30")
              td(colspan="6" class="p-3")
                pre(class="text-xs whitespace-pre-wrap break-all max-h-64 overflow-auto") {{ formatJson(row.payload) }}

    div(class="flex justify-end")
      UButton(
        v-if="items.length < total"
        :loading="loading"
        :disabled="loading"
        @click="loadMore") Load more
</template>
