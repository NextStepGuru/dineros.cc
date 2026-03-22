<script setup lang="ts">
definePageMeta({
  middleware: "auth",
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// Lazy-load tab components so Plaid and other heavy deps load only when tab is selected
const tabComponents: Record<string, ReturnType<typeof defineAsyncComponent>> = {
  "/edit-profile/profile": defineAsyncComponent(
    () => import("~/components/profile/EditProfileTab.vue"),
  ),
  "/edit-profile/team": defineAsyncComponent(
    () => import("~/components/profile/AccountTeamTab.vue"),
  ),
  "/edit-profile/password": defineAsyncComponent(
    () => import("~/components/profile/ChangePasswordTab.vue"),
  ),
  "/edit-profile/notifications": defineAsyncComponent(
    () => import("~/components/profile/NotificationsTab.vue"),
  ),
  "/edit-profile/sync-accounts": defineAsyncComponent(
    () => import("~/components/profile/SyncAccountsTab.vue"),
  ),
  "/edit-profile/two-factor-auth": defineAsyncComponent(
    () => import("~/components/profile/TwoFactorAuthTab.vue"),
  ),
  "/edit-profile/admin-settings": defineAsyncComponent(
    () => import("~/components/profile/AdminSettingsTab.vue"),
  ),
  "/edit-profile/debug-tools": defineAsyncComponent(
    () => import("~/components/profile/DebugToolsTab.vue"),
  ),
  "/edit-profile/openai-logs": defineAsyncComponent(
    () => import("~/components/profile/OpenAiLogsTab.vue"),
  ),
};

const adminOnlyPaths = new Set([
  "/edit-profile/admin-settings",
  "/edit-profile/debug-tools",
  "/edit-profile/openai-logs",
]);

const currentTabComponent = computed(() => {
  const path = route.path;
  if (adminOnlyPaths.has(path) && authStore.getUser?.isAdmin !== true) {
    return null;
  }
  return tabComponents[path] ?? null;
});

// Define available tabs
const navigationItems = computed(() => {
  const baseItems = [
    {
      label: "Profile",
      to: "/edit-profile/profile",
      active: route.path.startsWith("/edit-profile/profile"),
    },
    {
      label: "Team",
      to: "/edit-profile/team",
      active: route.path.startsWith("/edit-profile/team"),
    },
    {
      label: "Password",
      to: "/edit-profile/password",
      active: route.path.startsWith("/edit-profile/password"),
    },
    {
      label: "Notifications",
      to: "/edit-profile/notifications",
      active: route.path.startsWith("/edit-profile/notifications"),
    },
    {
      label: "Sync Accounts",
      to: "/edit-profile/sync-accounts",
      active: route.path.startsWith("/edit-profile/sync-accounts"),
    },
    {
      label: "2FA",
      to: "/edit-profile/two-factor-auth",
      active: route.path.startsWith("/edit-profile/two-factor-auth"),
    },
  ];

  if (authStore.getUser?.isAdmin === true) {
    return [
      ...baseItems,
      {
        label: "Admin",
        to: "/edit-profile/admin-settings",
        active: route.path.startsWith("/edit-profile/admin-settings"),
      },
      {
        label: "OpenAI logs",
        to: "/edit-profile/openai-logs",
        active: route.path.startsWith("/edit-profile/openai-logs"),
      },
    ];
  }

  return baseItems;
});

// Set up page head for SSR
useHead(() => {
  const currentPath = route.path;
  const tabLabel =
    navigationItems.value.find((item) => item.to === currentPath)?.label ||
    "Profile";
  return {
    title: `Edit Profile - ${tabLabel}`,
    meta: [
      {
        name: "description",
        content: `Edit your profile settings - ${tabLabel}`,
      },
    ],
  };
});

// Initialize with default tab if no query parameter
onMounted(() => {
  if (!route.params.tab) {
    router.push({ path: "/edit-profile/profile" });
  }
});
</script>

<template lang="pug">
div(class="container mx-auto px-4 py-8")
  h1(class="text-2xl font-bold text-center mb-8") Edit Profile

  // Tab Navigation
  div(class="flex justify-center mb-8")
    UNavigationMenu(
      :items="navigationItems"
      class="w-full max-w-2xl justify-center"
    )

  // Tab Content (lazy-loaded per tab)
  div(class="flex justify-center")
    component(:is="currentTabComponent" v-if="currentTabComponent")
</template>
