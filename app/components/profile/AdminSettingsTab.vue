<script setup lang="ts">
const { isAdminConsoleUser } = useAdminAccess();

if (!isAdminConsoleUser.value) {
  throw createError({
    statusCode: 403,
    statusMessage: "Access Denied",
  });
}
</script>

<template lang="pug">
div(class="max-w-2xl mx-auto space-y-6")
  UAlert(
    color="info"
    variant="soft"
    title="Admin console"
    description="Use the dedicated Admin Console for user and account management, audit log, system status, and the same global Plaid sync and backup tasks as on the Overview page.")

  UButton(to="/admin" color="primary" variant="soft") Open Admin Console

  div(class="flex flex-wrap gap-3 text-sm")
    NuxtLink(to="/admin/system" class="text-primary underline") System status
    NuxtLink(to="/admin/audit-logs" class="text-primary underline") Audit log
    NuxtLink(to="/admin/openai-logs" class="text-primary underline") OpenAI logs

  UAlert(
    color="neutral"
    variant="soft"
    title="Background tasks"
    description="Migrate, sync-all, and other task routes are not exposed here. Use the Admin Overview (Operations) or server automation with the internal API token when appropriate.")
</template>
