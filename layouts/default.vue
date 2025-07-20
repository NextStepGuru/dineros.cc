<script setup lang="ts">
const route = useRoute();
const isFooterHidden = computed(() => {
  const path = route.path;
  return (
    path.startsWith("/register/") ||
    path.startsWith("/account-registers") ||
    path.startsWith("/reoccurrences")
  );
});

useHead({
  title: "Dineros",
});

// Reactive body class based on route
onMounted(() => {
  watchEffect(() => {
    if (document.body) {
      document.body.className = isFooterHidden.value ? "ui-main" : "";
    }
  });
});
</script>

<template lang="pug">
  UApp
    XHeader

    //- main(class="max-w-[var(--ui-container)] m-auto")
    UMain(class="max-w-[var(--ui-container)] m-auto")
      NuxtPage

    USeparator(v-if="!isFooterHidden" type="dashed" class="h-px pt-0 px-4")

    XFooter(v-if="!isFooterHidden")
</template>
