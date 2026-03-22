<script setup lang="ts">
import type { User } from "../../types/types";

const toast = useToast();
const authStore = useAuthStore();

const plaidSyncEmailEnabled = ref(true);
const savingPlaidSyncEmail = ref(false);
const plaidConnectionIssueEmailEnabled = ref(true);
const savingPlaidConnectionIssue = ref(false);

function syncTogglesFromStore() {
  plaidSyncEmailEnabled.value =
    authStore.user?.settings?.plaid?.transactionSyncEmail !== false;
  plaidConnectionIssueEmailEnabled.value =
    authStore.user?.settings?.plaid?.connectionIssueEmail !== false;
}

onMounted(() => {
  syncTogglesFromStore();
});

watch(
  () => [
    authStore.user?.settings?.plaid?.transactionSyncEmail,
    authStore.user?.settings?.plaid?.connectionIssueEmail,
  ],
  () => syncTogglesFromStore(),
);

async function patchNotifications(
  patch: Partial<{
    plaidTransactionSyncEmail: boolean;
    plaidConnectionIssueEmail: boolean;
  }>,
  revert: () => void,
) {
  const { data, error } = await useAPI<User>(
    "/api/user/notification-settings",
    {
      method: "PATCH",
      body: patch,
    },
  );
  if (error.value) {
    revert();
    toast.add({
      color: "error",
      description:
        error.value.message || "Could not save notification preference.",
    });
    return;
  }
  if (data.value) {
    authStore.setUser(data.value);
  }
  toast.add({
    color: "success",
    description: "Notification preference saved.",
  });
}

async function savePlaidSyncEmail(value: boolean) {
  const previous = plaidSyncEmailEnabled.value;
  plaidSyncEmailEnabled.value = value;
  savingPlaidSyncEmail.value = true;
  try {
    await patchNotifications(
      { plaidTransactionSyncEmail: value },
      () => {
        plaidSyncEmailEnabled.value = previous;
      },
    );
  } finally {
    savingPlaidSyncEmail.value = false;
  }
}

async function savePlaidConnectionIssueEmail(value: boolean) {
  const previous = plaidConnectionIssueEmailEnabled.value;
  plaidConnectionIssueEmailEnabled.value = value;
  savingPlaidConnectionIssue.value = true;
  try {
    await patchNotifications(
      { plaidConnectionIssueEmail: value },
      () => {
        plaidConnectionIssueEmailEnabled.value = previous;
      },
    );
  } finally {
    savingPlaidConnectionIssue.value = false;
  }
}
</script>

<template lang="pug">
div(class="max-w-2xl min-h-96 my-4 m-auto space-y-8")
  h2(class="text-xl font-bold text-center mb-2") Notifications

  div(class="space-y-2")
    h3(class="text-sm font-semibold frog-text-muted") Banking (Plaid)
    UCard
      template(#header)
        .text-sm.font-medium Email
      div(class="space-y-6")
        UFormField(
          label="Transaction sync summary"
          description="Email a short summary after new bank transactions are imported (one email per sync)."
        )
          .flex.items-center(class="h-8")
            USwitch(
              :model-value="plaidSyncEmailEnabled"
              :disabled="savingPlaidSyncEmail || savingPlaidConnectionIssue"
              @update:model-value="savePlaidSyncEmail"
            )
        UFormField(
          label="Bank connection issues"
          description="Email when your bank link needs attention (for example, reconnection required). At most once per 24 hours."
        )
          .flex.items-center(class="h-8")
            USwitch(
              :model-value="plaidConnectionIssueEmailEnabled"
              :disabled="savingPlaidSyncEmail || savingPlaidConnectionIssue"
              @update:model-value="savePlaidConnectionIssueEmail"
            )
</template>
