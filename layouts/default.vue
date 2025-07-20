<script setup lang="ts">
const route = useRoute();
const isHomepage = computed(() => route.path === "/");

useHead({
  title: "Dineros",
});

// Reactive body class based on route
onMounted(() => {
  watchEffect(() => {
    if (document.body) {
      document.body.className = isHomepage.value ? "" : "ui-main";
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

    USeparator(v-if="isHomepage" type="dashed" class="h-px pt-0 px-4")

    XFooter(v-if="isHomepage")
</template>
