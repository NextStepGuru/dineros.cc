<script setup lang="ts">
const route = useRoute();
const isFooterHidden = computed(() => {
  const path = route.path;
  return (
    path.startsWith("/register/") ||
    path.startsWith("/account-registers") ||
    path.startsWith("/reoccurrences") ||
    path.startsWith("/reports")
  );
});

useHead({
  title: "Dineros",
});

const routeAnnouncement = ref("");
watch(
  () => route.path,
  () => {
    nextTick(() => {
      const heading = document.querySelector("h1");
      const title = heading?.textContent?.trim() || document.title;
      routeAnnouncement.value = "";
      requestAnimationFrame(() => {
        routeAnnouncement.value = `Navigated to ${title}`;
      });
    });
  },
);

// Reactive body class based on route
onMounted(() => {
  watchEffect(() => {
    if (document.body) {
      const path = route.path;
      if (path.startsWith("/reports")) {
        document.body.className = "ui-main-scroll";
      } else {
        document.body.className = isFooterHidden.value ? "ui-main" : "";
      }
    }
  });
});
</script>

<template lang="pug">
  UApp
    a(
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-white focus:outline-none focus:ring-2 focus:ring-offset-2"
    ) Skip to main content
    div(class="sr-only" aria-live="polite" aria-atomic="true") {{ routeAnnouncement }}
    XHeader

    UMain#main-content(tabindex="-1" :class="route.path === '/' ? 'w-full' : 'max-w-(--ui-container) mx-auto'")
      NuxtPage

    USeparator(v-if="!isFooterHidden" type="dashed" class="h-px pt-0 px-4")

    XFooter(v-if="!isFooterHidden")
</template>
