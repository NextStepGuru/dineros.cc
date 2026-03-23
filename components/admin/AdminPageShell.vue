<script setup lang="ts">
const route = useRoute();

type NavItem = {
  label: string;
  to: string;
  active: boolean;
};

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
  }>(),
  {
    description: "Manage admin-level operations and data access.",
  },
);

const navItems = computed<NavItem[]>(() => [
  {
    label: "Overview",
    to: "/admin",
    active: route.path === "/admin",
  },
  {
    label: "Users",
    to: "/admin/users",
    active: route.path.startsWith("/admin/users"),
  },
  {
    label: "Accounts",
    to: "/admin/accounts",
    active: route.path.startsWith("/admin/accounts"),
  },
  {
    label: "OpenAI logs",
    to: "/admin/openai-logs",
    active: route.path.startsWith("/admin/openai-logs"),
  },
]);
</script>

<template lang="pug">
div(class="container mx-auto px-4 py-6 lg:py-8")
  div(class="mx-auto max-w-7xl space-y-6")
    div(class="space-y-1")
      h1(class="text-2xl font-bold") {{ props.title }}
      p(class="text-sm frog-text-muted") {{ props.description }}

    div(class="grid gap-4 lg:gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]")
      aside(class="lg:sticky lg:top-24 lg:self-start")
        div(class="rounded-lg border border-default p-2 bg-default/40")
          p(class="px-2 py-1 text-xs font-semibold uppercase tracking-wide frog-text-muted") Admin
          nav(class="mt-1 space-y-1")
            NuxtLink(
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="block rounded-md px-2.5 py-2 text-sm transition-colors"
              :class="item.active ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-elevated text-muted hover:text-highlighted'")
              | {{ item.label }}

      main(class="min-w-0")
        UCard
          slot
</template>
