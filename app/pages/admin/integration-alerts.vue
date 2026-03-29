<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "admin"],
});

useHead({
  title: "Admin Integration alerts",
  meta: [
    {
      name: "description",
      content: "Plaid and OpenAI integration credential alerts.",
    },
  ],
});
</script>

<template lang="pug">
AdminPageShell(
  title="Integration alerts"
  description="Credential and auth failures for Plaid and OpenAI (structured logs, email, and console).")
  IntegrationAlertsTab
</template>
