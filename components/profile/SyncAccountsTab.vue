<script setup lang="ts">
import type { PlaidLinkOptions } from "@jcss/vue-plaid-link";
import { PlaidLink } from "@jcss/vue-plaid-link";
import type { PlaidAccount, User } from "../../types/types";

const toast = useToast();
const authStore = useAuthStore();
const listStore = useListStore();



const isLoaded = ref(false);
const publicToken = ref("");
const isLoading = ref(false);

const plaidLinkOptions = ref<PlaidLinkOptions>({
  token: "",
  onSuccess: async (public_token, metadata) => {
    const { data: userResponse } = await useAPI<User>("/api/plaid-link", {
      method: "POST",
      body: { public_token, metadata },
    });

    isLoaded.value = true;
    publicToken.value = public_token;

    if (userResponse.value) {
      authStore.setUser(userResponse.value);
      await loadSyncedAccounts();
    }
  },
});

async function connectToPlaid() {
  try {
    const { data: res, error } = await useAPI<{
      expiration: string;
      link_token: string;
      request_id: string;
    }>("/api/plaid-link");

    if (res?.value && res.value.link_token) {
      plaidLinkOptions.value.token = res.value.link_token;
    } else if (error?.value) {
      console.error("API error:", error.value);
      toast.add({
        color: "error",
        description: error.value.message || "Failed to get Plaid link token.",
      });
    }
  } catch (error) {
    console.error("connectToPlaid error:", error);
    toast.add({
      color: "error",
      description: "Failed to connect to Plaid.",
    });
  }
}

// Currently synced accounts
const syncedAccounts = ref<any[]>([]);
async function loadSyncedAccounts() {
  isLoading.value = true;
  try {
    const { data: res, error } = await useAPI<{ accounts: any[] }>(
      "/api/plaid-synced-accounts"
    );

    if (res?.value && !error?.value) {
      syncedAccounts.value = res.value.accounts;
    } else if (error?.value) {
      // Only show error if it's not a "Plaid not enabled" error
      if (!error.value.message?.includes("not enabled")) {
        toast.add({
          color: "error",
          description: error.value.message || "Failed to load synced accounts.",
        });
      }
    }
  } catch (error) {
    toast.add({
      color: "error",
      description: "Failed to load synced accounts.",
    });
  } finally {
    isLoading.value = false;
  }
}

// Available Plaid accounts to link
const availablePlaidAccounts = ref<PlaidAccount[]>([]);
async function loadAvailablePlaidAccounts() {
  if (!authStore.hasPlaidConnected) return;

  try {
    const { data: res, error } = await useAPI<{ accounts: PlaidAccount[] }>(
      "/api/plaid-list-accounts"
    );

    if (res?.value && !error?.value) {
      availablePlaidAccounts.value = res.value.accounts;
    } else if (error?.value) {
      // Only show error if it's not a "Plaid not enabled" error
      if (!error.value.message?.includes("not enabled")) {
        console.error("Failed to load available Plaid accounts:", error.value);
      }
    }
  } catch (error) {
    console.error("Failed to load available Plaid accounts:", error);
  }
}

// Load data when component mounts or auth state changes
// Always try to load synced accounts, regardless of Plaid connection status
loadSyncedAccounts();

// Only load available accounts if Plaid is connected
if (authStore.hasPlaidConnected) {
  loadAvailablePlaidAccounts();
}

watch(authStore, () => {
  // Always reload synced accounts when auth state changes
  loadSyncedAccounts();

  // Only reload available accounts if Plaid is connected
  if (authStore.hasPlaidConnected) {
    loadAvailablePlaidAccounts();
  }
});

// Disconnect account functionality
const isDisconnecting = ref<number | null>(null);
async function disconnectAccount(accountRegisterId: number) {
  isDisconnecting.value = accountRegisterId;
  try {
    const { data: res, error } = await useAPI("/api/plaid-disconnect-account", {
      method: "POST",
      body: { accountRegisterId },
    });

    if (res?.value && !error?.value) {
      toast.add({
        color: "success",
        description: "Account disconnected successfully.",
      });
      await loadSyncedAccounts();
      await loadAvailablePlaidAccounts();
      listStore.fetchLists();
    } else if (error?.value) {
      toast.add({
        color: "error",
        description: error.value.message || "Failed to disconnect account.",
      });
    }
  } catch (error) {
    toast.add({
      color: "error",
      description: "Failed to disconnect account.",
    });
  } finally {
    isDisconnecting.value = null;
  }
}

// Link accounts functionality
const selectedAccounts = ref<Record<string, number | null>>({});

type LinkedAccountType = {
  id: number | string | null;
  name: string;
  disabled: boolean;
};

const linkBankAccounts = computed<LinkedAccountType[]>(() => {
  const selectedAccountIds = new Set(Object.values(selectedAccounts.value));

  return listStore.getAccountRegisters
    .map(
      (ar): LinkedAccountType => ({
        id: ar.id,
        name: ar.name,
        disabled: selectedAccountIds.has(ar.id),
      })
    )
    .concat([
      { id: 0, name: "Add Bank Account", disabled: false },
      { id: null, name: "Do not link", disabled: false },
    ]);
});

const isLinkingAccounts = ref(false);
async function linkAccounts() {
  isLinkingAccounts.value = true;
  try {
    const linkAccountsArray = Object.entries(selectedAccounts.value)
      .map(([plaidId, accountRegisterId]) => ({
        plaidId,
        accountRegisterId,
      }))
      .filter((account) => account.accountRegisterId !== null);

    const { data: res, error } = await useAPI<User>(
      "/api/plaid-link-accounts",
      {
        method: "POST",
        body: { linkAccounts: linkAccountsArray },
      }
    );

    if (res?.value && !error?.value) {
      toast.add({
        color: "success",
        description: "Accounts linked successfully.",
      });
      authStore.setUser(res.value);
      listStore.fetchLists();
      await loadSyncedAccounts();
      await loadAvailablePlaidAccounts();
      selectedAccounts.value = {};
    } else if (error?.value) {
      toast.add({
        color: "error",
        description: error.value.message || "Account linking failed.",
      });
    }
  } catch (error) {
    toast.add({
      color: "error",
      description: "Failed to link accounts.",
    });
  } finally {
    isLinkingAccounts.value = false;
  }
}

// Format date for display
function formatDate(dateString: string | null) {
  if (!dateString) return "Never";
  return new Date(dateString).toLocaleDateString();
}

// Format balance for display
function formatBalance(balance: number, isCredit: boolean) {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Math.abs(balance));

  if (isCredit) {
    return balance < 0 ? `+${formatted}` : `-${formatted}`;
  } else {
    return balance < 0 ? `-${formatted}` : `+${formatted}`;
  }
}
</script>

<template lang="pug">
div.p-4
  h2(class="text-xl font-bold text-center") Sync Accounts

  // Connect to Plaid section
  .pt-5(v-if="!authStore.hasPlaidConnected")
    UButton(
      color="info"
      size="lg"
      v-if="!plaidLinkOptions.token"
      @click="connectToPlaid()"
    ) Link Plaid (Debug)
    PlaidLink(v-bind="plaidLinkOptions" v-else-if="!isLoaded")
      UButton(color="primary" size="lg" type="button" block) Connect to Plaid

  // Main content when Plaid is connected OR when there are synced accounts
  .pt-5(v-if="authStore.hasPlaidConnected || syncedAccounts.length > 0")
    // Currently synced accounts
    div(v-if="syncedAccounts.length > 0")
      h3(class="text-lg font-semibold mb-4") Currently Synced Accounts
      .overflow-x-auto
        table(class="w-full mb-6")
          thead(class="bg-gray-50 dark:bg-gray-800")
            tr
              th.text-left.p-3 Account Name
              th.text-left.p-3 Type
              th.text-left.p-3 Balance
              th.text-left.p-3 Last Sync
              th.text-left.p-3 Actions
          tbody
            tr(
              v-for="account in syncedAccounts"
              :key="account.id"
              class="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            )
              td.p-3 {{ account.name }}
              td.p-3 {{ account.type.name }}
              td.p-3(:class="account.balance < 0 ? 'text-red-600' : 'text-green-600'") {{ formatBalance(account.balance, account.type.isCredit) }}
              td.p-3 {{ formatDate(account.plaidLastSyncAt) }}
              td.p-3
                UButton(
                  color="error"
                  size="sm"
                  :loading="isDisconnecting === account.id"
                  @click="disconnectAccount(account.id)"
                ) Disconnect

    // Available accounts to link (only show when Plaid is connected)
    div(v-if="authStore.hasPlaidConnected && availablePlaidAccounts.length > 0")
      h3(class="text-lg font-semibold mb-4 mt-8") Available Accounts to Link
      .overflow-x-auto
        table(class="w-full")
          thead(class="bg-gray-50 dark:bg-gray-800")
            tr
              th.text-left.p-3 Plaid Account
              th.text-left.p-3 Account Number
              th.text-left.p-3
              th.text-left.p-3 Link To
          tbody
            tr(
              v-for="account in availablePlaidAccounts"
              :key="account.id"
              class="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            )
              td.p-3 {{ account.name }}
              td.p-3 {{ account.mask }}
              td.p-3
                UIcon(name="lucide:arrow-right-left" class="text-gray-400")
              td.p-3
                USelect(
                  v-model="selectedAccounts[account.id]"
                  :items="linkBankAccounts"
                  value-key="id"
                  label-key="name"
                  class="w-full"
                )

      .mt-4
        UButton(
          color="warning"
          size="lg"
          :loading="isLinkingAccounts"
          :disabled="Object.keys(selectedAccounts).length === 0"
          @click="linkAccounts"
        ) Link Selected Accounts

    // No accounts available
    div(v-else-if="syncedAccounts.length === 0")
      p.text-center.text-gray-500.mt-8 No accounts are currently synced. Link your first account above.
</template>
