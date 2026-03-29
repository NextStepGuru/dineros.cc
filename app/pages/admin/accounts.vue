<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "admin"],
});

const toast = useToast();
const $api = useNuxtApp().$api as typeof $fetch;

type AdminAccountRow = {
  id: string;
  name: string;
  isArchived: boolean;
  updatedAt: string;
  memberCount: number;
};

type AccountMember = {
  membershipId: number;
  userId: number;
  updatedAt: string;
  user: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: "USER" | "ADMIN";
    isArchived: boolean;
  };
};

type PlaidItemRow = {
  itemId: string;
  userId: number;
  updatedAt: string;
  syncCursorUpdatedAt: string | null;
};

type AdminAccountDetail = {
  id: string;
  name: string;
  isArchived: boolean;
  isDefault: boolean;
  lastAccessedAt: string | null;
  updatedAt: string;
  plaidItems: PlaidItemRow[];
  members: AccountMember[];
};

const query = ref("");
const limit = 25;
const offset = ref(0);
const total = ref(0);
const loading = ref(false);
const loadingDetail = ref(false);
const items = ref<AdminAccountRow[]>([]);
const selectedAccountId = ref<string | null>(null);
const selectedAccount = ref<AdminAccountDetail | null>(null);
const accountAction = ref<
  "recalculate" | "sync-plaid" | "cleanup-balance" | null
>(null);
const cleanupModalOpen = ref(false);

async function loadAccounts(reset: boolean) {
  loading.value = true;
  if (reset) {
    offset.value = 0;
    selectedAccountId.value = null;
    selectedAccount.value = null;
  }
  try {
    const response = await $api<{
      items: AdminAccountRow[];
      total: number;
      limit: number;
      offset: number;
    }>("/api/admin/accounts", {
      query: {
        q: query.value,
        limit,
        offset: reset ? 0 : offset.value,
      },
    });
    total.value = response.total;
    if (reset) {
      items.value = response.items;
    } else {
      items.value = [...items.value, ...response.items];
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to load accounts.";
    toast.add({
      color: "error",
      description: message,
    });
  } finally {
    loading.value = false;
  }
}

async function selectAccount(accountId: string) {
  selectedAccountId.value = accountId;
  loadingDetail.value = true;
  try {
    selectedAccount.value = await $api<AdminAccountDetail>(
      `/api/admin/accounts/${accountId}`,
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to load account details.";
    toast.add({
      color: "error",
      description: message,
    });
  } finally {
    loadingDetail.value = false;
  }
}

function loadMore() {
  offset.value += limit;
  loadAccounts(false);
}

function clearSearch() {
  query.value = "";
  loadAccounts(true);
}

async function runAccountRecalculate() {
  if (!selectedAccountId.value) return;
  accountAction.value = "recalculate";
  try {
    await $api(`/api/admin/accounts/${selectedAccountId.value}/recalculate`, {
      method: "POST",
    });
    toast.add({
      color: "success",
      description: "Recalculate job queued for this account.",
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to queue recalculate.";
    toast.add({ color: "error", description: message });
  } finally {
    accountAction.value = null;
  }
}

async function runAccountPlaidSync() {
  if (!selectedAccountId.value) return;
  accountAction.value = "sync-plaid";
  try {
    const res = await $api<{ message: string; queued: number }>(
      `/api/admin/accounts/${selectedAccountId.value}/sync-plaid`,
      { method: "POST" },
    );
    toast.add({
      color: "success",
      description: res.message,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to queue Plaid sync.";
    toast.add({ color: "error", description: message });
  } finally {
    accountAction.value = null;
  }
}

async function runAccountCleanupBalance() {
  if (!selectedAccountId.value) return;
  accountAction.value = "cleanup-balance";
  cleanupModalOpen.value = false;
  try {
    const res = await $api<{ deletedCount: number; message: string }>(
      `/api/admin/accounts/${selectedAccountId.value}/cleanup-balance-entries`,
      { method: "POST" },
    );
    toast.add({
      color: "success",
      description: `${res.message} (${res.deletedCount} removed)`,
    });
    if (selectedAccountId.value) {
      await selectAccount(selectedAccountId.value);
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Cleanup failed.";
    toast.add({ color: "error", description: message });
  } finally {
    accountAction.value = null;
  }
}

onMounted(() => {
  loadAccounts(true);
});

useHead({
  title: "Admin Accounts",
  meta: [
    {
      name: "description",
      content: "Admin account management.",
    },
  ],
});
</script>

<template lang="pug">
AdminPageShell(
  title="Admin Accounts"
  description="Find accounts and inspect account membership.")
  div(class="space-y-4")
    div(class="flex flex-wrap items-center gap-2")
      UInput(
        v-model="query"
        placeholder="Search by account id, account name, or member email"
        class="w-full sm:max-w-md"
        @keyup.enter="loadAccounts(true)")
      UButton(
        color="primary"
        :loading="loading"
        @click="loadAccounts(true)") Search
      UButton(
        variant="outline"
        :disabled="loading"
        @click="clearSearch") Clear

    p(class="text-sm frog-text-muted")
      | Showing {{ items.length }} of {{ total }} accounts.

    div(class="overflow-x-auto rounded-lg border border-default")
      table(class="w-full text-sm")
        thead(class="bg-elevated")
          tr
            th(class="p-2 text-left") Account
            th(class="p-2 text-left") Account ID
            th(class="p-2 text-left") Members
            th(class="p-2 text-left") Updated
        tbody
          tr(
            v-for="account in items"
            :key="account.id"
            class="cursor-pointer border-t border-default transition-colors hover:bg-elevated/50"
            :class="{ 'bg-primary/10': account.id === selectedAccountId }"
            @click="selectAccount(account.id)")
            td(class="p-2")
              div(class="font-medium") {{ account.name }}
              UBadge(
                v-if="account.isArchived"
                color="warning"
                variant="subtle"
                size="xs") Archived
            td(class="p-2 font-mono text-xs") {{ account.id }}
            td(class="p-2") {{ account.memberCount }}
            td(class="p-2") {{ new Date(account.updatedAt).toLocaleString() }}

    div(class="flex justify-end")
      UButton(
        v-if="items.length < total"
        :loading="loading"
        :disabled="loading"
        @click="loadMore") Load more

    UAlert(
      v-if="!selectedAccount && !loadingDetail"
      color="neutral"
      variant="soft"
      title="Select an account"
      description="Choose an account row above to inspect its members."
    )

    UCard(v-if="selectedAccount")
      template(#header)
        div(class="flex flex-wrap items-center gap-2")
          h2(class="text-base font-semibold") {{ selectedAccount.name }}
          UBadge(
            :color="selectedAccount.isDefault ? 'primary' : 'neutral'"
            variant="subtle") {{ selectedAccount.isDefault ? 'Default' : 'Non-default' }}
          UBadge(
            v-if="selectedAccount.isArchived"
            color="warning"
            variant="subtle") Archived
      div(class="space-y-3")
        div(class="text-sm frog-text-muted")
          div Account ID: {{ selectedAccount.id }}
          div Last accessed: {{ selectedAccount.lastAccessedAt ? new Date(selectedAccount.lastAccessedAt).toLocaleString() : 'Never' }}
          div Updated: {{ new Date(selectedAccount.updatedAt).toLocaleString() }}

        div(class="overflow-x-auto rounded-lg border border-default")
          table(class="w-full text-sm")
            thead(class="bg-elevated")
              tr
                th(class="p-2 text-left") Member
                th(class="p-2 text-left") Email
                th(class="p-2 text-left") Role
                th(class="p-2 text-left") Status
            tbody
              tr(
                v-for="member in selectedAccount.members"
                :key="member.membershipId"
                class="border-t border-default")
                td(class="p-2")
                  div(class="font-medium") {{ [member.user.firstName, member.user.lastName].filter(Boolean).join(" ") || `User #${member.user.id}` }}
                  div(class="text-xs frog-text-muted") User ID {{ member.user.id }}
                td(class="p-2") {{ member.user.email }}
                td(class="p-2")
                  UBadge(:color="member.user.role === 'ADMIN' ? 'warning' : 'neutral'" variant="subtle") {{ member.user.role }}
                td(class="p-2")
                  UBadge(:color="member.user.isArchived ? 'warning' : 'success'" variant="subtle")
                    | {{ member.user.isArchived ? 'Archived' : 'Active' }}

        div(v-if="selectedAccount.plaidItems.length > 0")
          h3(class="text-sm font-semibold") Plaid connections
          div(class="overflow-x-auto rounded-lg border border-default mt-2")
            table(class="w-full text-sm")
              thead(class="bg-elevated")
                tr
                  th(class="p-2 text-left") Item ID
                  th(class="p-2 text-left") User
                  th(class="p-2 text-left") Item updated
                  th(class="p-2 text-left") Sync cursor
              tbody
                tr(
                  v-for="row in selectedAccount.plaidItems"
                  :key="row.itemId"
                  class="border-t border-default")
                  td(class="p-2 font-mono text-xs break-all") {{ row.itemId }}
                  td(class="p-2") {{ row.userId }}
                  td(class="p-2") {{ new Date(row.updatedAt).toLocaleString() }}
                  td(class="p-2") {{ row.syncCursorUpdatedAt ? new Date(row.syncCursorUpdatedAt).toLocaleString() : '—' }}

        p(v-else class="text-sm frog-text-muted") No Plaid items for this account’s members.

        div(class="border-t border-default pt-4 space-y-3")
          h3(class="text-sm font-semibold") Account-scoped jobs
          p(class="text-sm frog-text-muted")
            | Queue forecast recalculation, Plaid sync for all items on this account’s members, or remove balance-only register entries for this account.
          div(class="flex flex-wrap gap-2")
            UButton(
              color="primary"
              variant="soft"
              icon="i-lucide-calculator"
              :loading="accountAction === 'recalculate'"
              :disabled="!!accountAction"
              @click="runAccountRecalculate") Queue recalculate
            UButton(
              color="info"
              variant="soft"
              icon="i-lucide-link"
              :loading="accountAction === 'sync-plaid'"
              :disabled="!!accountAction"
              @click="runAccountPlaidSync") Queue Plaid sync
            UButton(
              color="error"
              variant="soft"
              icon="i-lucide-trash-2"
              :loading="accountAction === 'cleanup-balance'"
              :disabled="!!accountAction"
              @click="cleanupModalOpen = true") Remove balance entries…

    UModal(v-model:open="cleanupModalOpen" :ui="{ width: 'sm:max-w-md' }")
      template(#header) Remove balance entries?
      template(#body)
        p(class="text-sm frog-text-muted")
          | Deletes all register entries marked as balance entries for this account only. Use after backups; this cannot be undone from the UI.
      template(#footer)
        div(class="flex justify-end gap-2")
          UButton(variant="soft" @click="cleanupModalOpen = false") Cancel
          UButton(color="error" @click="runAccountCleanupBalance") Remove balance entries
</template>
