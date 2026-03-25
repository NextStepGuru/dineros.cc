<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "admin"],
});

const toast = useToast();
const $api = useNuxtApp().$api as typeof $fetch;
const runningTask = ref<"sync-plaid" | "backup" | null>(null);

async function runAdminTask(task: "sync-plaid" | "backup") {
  const labels = {
    "sync-plaid": "Plaid sync",
    backup: "backup",
  } as const;

  try {
    runningTask.value = task;
    toast.add({
      color: "info",
      description: `Starting ${labels[task]}...`,
    });

    await $api(`/api/tasks/${task}`, {
      method: "POST",
    });

    toast.add({
      color: "success",
      description: `${labels[task]} queued successfully.`,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : `Failed to queue ${labels[task]}.`;

    toast.add({
      color: "error",
      description: message,
    });
  } finally {
    runningTask.value = null;
  }
}

useHead({
  title: "Admin",
  meta: [
    {
      name: "description",
      content: "Admin dashboard for user and account management.",
    },
  ],
});
</script>

<template lang="pug">
AdminPageShell(
  title="Admin"
  description="Manage users, accounts, and operational admin tools.")
  div(class="space-y-6")
    UAlert(
      color="primary"
      variant="soft"
      title="Admin console enabled"
      description="Use the admin navigation to search users and accounts, edit profile details, and reset passwords."
    )
    div(class="grid gap-4 md:grid-cols-2")
      UCard
        template(#header)
          h2(class="text-base font-semibold") User operations
        p(class="text-sm frog-text-muted")
          | Search users, update core profile fields, and set temporary passwords.
        div(class="mt-4")
          UButton(to="/admin/users" color="primary") Go to Users
      UCard
        template(#header)
          h2(class="text-base font-semibold") Account operations
        p(class="text-sm frog-text-muted")
          | Search accounts and inspect account membership details.
        div(class="mt-4")
          UButton(to="/admin/accounts" color="primary") Go to Accounts
    UCard
      template(#header)
        h2(class="text-base font-semibold") Operations
      p(class="text-sm frog-text-muted")
        | Run admin-only background jobs for Plaid and backups.
      div(class="mt-4 grid gap-3 md:grid-cols-2")
        UButton(
          color="info"
          icon="i-lucide-refresh-cw"
          :loading="runningTask === 'sync-plaid'"
          :disabled="!!runningTask"
          @click="runAdminTask('sync-plaid')"
        ) Force Plaid sync
        UButton(
          color="primary"
          icon="i-lucide-database"
          :loading="runningTask === 'backup'"
          :disabled="!!runningTask"
          @click="runAdminTask('backup')"
        ) Force backup
</template>
