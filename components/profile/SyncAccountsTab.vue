<script setup lang="ts">
import type { PlaidLinkOptions } from "@jcss/vue-plaid-link";
import { PlaidLink } from "@jcss/vue-plaid-link";
import type { TableColumn } from "@nuxt/ui";
import { h, resolveComponent } from "vue";
import type { PlaidAccount, User } from "../../types/types";

const UButton = resolveComponent("UButton");
const USelect = resolveComponent("USelect");
const UIcon = resolveComponent("UIcon");

type SyncedAccountRow = {
  id: number;
  name: string;
  balance: number;
  plaidLastSyncAt: string | null;
  type: { name: string; isCredit: boolean };
};

const stripedTheme = ref({
  tr: "odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700",
});

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
const syncedAccounts = ref<SyncedAccountRow[]>([]);
async function loadSyncedAccounts() {
  isLoading.value = true;
  try {
    const { data: res, error } = await useAPI<{ accounts: any[] }>(
      "/api/plaid-synced-accounts"
    );

    if (res?.value && !error?.value) {
      syncedAccounts.value = res.value.accounts as SyncedAccountRow[];
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

const syncedColumns = computed<TableColumn<SyncedAccountRow>[]>(() => {
  void isDisconnecting.value;
  return [
    {
      accessorKey: "name",
      header: () => h("div", { class: "text-left" }, "Account Name"),
      cell: ({ row }) => row.getValue("name"),
    },
    {
      id: "accountType",
      header: () => h("div", { class: "text-left" }, "Type"),
      cell: ({ row }) => row.original.type?.name ?? "—",
    },
    {
      id: "balance",
      header: () => h("div", { class: "text-left" }, "Balance"),
      cell: ({ row }) => {
        const acc = row.original;
        const cls =
          acc.balance < 0 ? "frog-status-negative" : "frog-status-positive";
        return h(
          "div",
          { class: cls },
          formatBalance(acc.balance, acc.type.isCredit),
        );
      },
    },
    {
      id: "lastSync",
      header: () => h("div", { class: "text-left" }, "Last Sync"),
      cell: ({ row }) => formatDate(row.original.plaidLastSyncAt),
    },
    {
      id: "actions",
      header: () => h("div", { class: "text-left" }, "Actions"),
      cell: ({ row }) =>
        h(
          UButton,
          {
            color: "error",
            size: "sm",
            loading: isDisconnecting.value === row.original.id,
            onClick: () => disconnectAccount(row.original.id),
          },
          { default: () => "Disconnect" },
        ),
    },
  ];
});

const linkColumns = computed<TableColumn<PlaidAccount>[]>(() => {
  void selectedAccounts.value;
  void linkBankAccounts.value;
  return [
    {
      accessorKey: "name",
      header: () => h("div", { class: "text-left" }, "Plaid Account"),
      cell: ({ row }) => row.getValue("name"),
    },
    {
      accessorKey: "mask",
      header: () => h("div", { class: "text-left" }, "Account Number"),
      cell: ({ row }) => row.getValue("mask"),
    },
    {
      id: "arrow",
      header: () => h("div", {}),
      cell: () =>
        h(UIcon, {
          name: "lucide:arrow-right-left",
          class: "frog-text-muted",
        }),
    },
    {
      id: "linkTo",
      header: () => h("div", { class: "text-left" }, "Link To"),
      cell: ({ row }) => {
        const plaidId = row.original.id;
        return h(USelect, {
          modelValue: selectedAccounts.value[plaidId],
          "onUpdate:modelValue": (v: number | string | null) => {
            selectedAccounts.value = {
              ...selectedAccounts.value,
              [plaidId]: v as number | null,
            };
          },
          items: linkBankAccounts.value,
          valueKey: "id",
          labelKey: "name",
          class: "w-full",
        });
      },
    },
  ];
});
</script>

<template lang="pug">
div.p-4
  h2(class="text-xl font-bold text-center") Sync Accounts
  p(class="text-sm text-center frog-text-muted max-w-2xl mx-auto mb-4")
    | Bank connections are tied to your login. Everyone you invite can see shared account data; only this profile&apos;s Plaid connection is used for bank linking.

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
      .overflow-x-auto.mb-6
        UTable(
          class="w-full"
          :data="syncedAccounts"
          :columns="syncedColumns"
          :ui="stripedTheme"
        )

    // Available accounts to link (only show when Plaid is connected)
    div(v-if="authStore.hasPlaidConnected && availablePlaidAccounts.length > 0")
      h3(class="text-lg font-semibold mb-4 mt-8") Available Accounts to Link
      .overflow-x-auto
        UTable(
          class="w-full"
          :data="availablePlaidAccounts"
          :columns="linkColumns"
          :ui="stripedTheme"
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
      p.text-center.frog-text-muted.mt-8 No accounts are currently synced. Link your first account above.
</template>
