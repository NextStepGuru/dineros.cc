<script setup lang="ts">
// Unmatched client routes → branded error page via error.vue
throw createError({
  statusCode: 404,
  statusMessage: "Page not found",
});
</script>

<template>
  <div />
</template>
