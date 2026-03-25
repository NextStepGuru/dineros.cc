<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "admin"],
});

useHead({
  title: "Admin OpenAI Logs",
  meta: [
    {
      name: "description",
      content: "Admin OpenAI request logs.",
    },
  ],
});
</script>

<template lang="pug">
AdminPageShell(
  title="OpenAI logs"
  description="Review OpenAI request volume, latency, and failures.")
  ProfileOpenAiLogsTab
</template>
