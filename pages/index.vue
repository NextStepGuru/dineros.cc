<script setup lang="ts">
const links = ref([
  {
    label: "Get started",
    to: "/login",
  },
]);
</script>

<template>
  <UPageHero
    class="flex items-center justify-center min-h-[calc(100vh-var(--ui-header-height))] bg-gradient-to-b from-[var(--ui-bg)] to-teal-950 text-white"
    title="Welcome to Dineros"
    description="The solution to predictive budgeting, real-time spending optimization, & accounting made simple"
    :links="links" headline="New release" orientation="horizontal">
    <NuxtImg
      src="https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto/v1737776329/pepe_solo_t0twqk.png"
      alt="App screenshot" class="w-md" />
  </UPageHero>
</template>
