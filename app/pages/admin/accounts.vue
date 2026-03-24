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

type AdminAccountDetail = {
  id: string;
  name: string;
  isArchived: boolean;
  isDefault: boolean;
  lastAccessedAt: string | null;
  updatedAt: string;
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
</template>
