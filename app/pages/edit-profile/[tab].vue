<script setup lang="ts">
definePageMeta({
  middleware: "auth",
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { isAdminConsoleUser } = useAdminAccess();
const isAdminUser = isAdminConsoleUser;

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
  if (adminOnlyPaths.has(path) && !isAdminUser.value) {
    return null;
  }
  return tabComponents[path] ?? null;
});

type NavItem = {
  label: string;
  to: string;
  active: boolean;
};

const coreNavigationItems = computed<NavItem[]>(() => [
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
]);

const tabHeadingOverrides: Record<string, string> = {
  "/edit-profile/password": "Change password",
  "/edit-profile/team": "Team & Invitations",
  "/edit-profile/two-factor-auth": "Two-Factor Authentication",
  "/edit-profile/admin-settings": "Admin settings",
  "/edit-profile/debug-tools": "Debug tools",
  "/edit-profile/openai-logs": "OpenAI logs",
};

const currentTabLabel = computed(
  () =>
    tabHeadingOverrides[route.path] ??
    coreNavigationItems.value.find((item) => item.to === route.path)?.label ??
    "Profile",
);

// Set up page head for SSR
useHead(() => {
  return {
    title: `Settings - ${currentTabLabel.value}`,
    meta: [
      {
        name: "description",
        content: `Manage your account settings - ${currentTabLabel.value}`,
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
div(class="container mx-auto px-4 py-6 lg:py-8")
  div(class="mx-auto max-w-7xl space-y-6")
    div(class="space-y-1")
      h1(class="text-2xl font-bold") Edit Profile
      p(class="text-sm frog-text-muted") Manage your profile, security, notifications, and connected services.

    div(class="grid gap-4 lg:gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]")
      aside(class="lg:sticky lg:top-24 lg:self-start")
        div(class="rounded-lg border border-default p-2 bg-default/40")
          p(class="px-2 py-1 text-xs font-semibold uppercase tracking-wide frog-text-muted") General
          nav(class="mt-1 space-y-1")
            NuxtLink(
              v-for="item in coreNavigationItems"
              :key="item.to"
              :to="item.to"
              class="block rounded-md px-2.5 py-2 text-sm transition-colors"
              :class="item.active ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-elevated text-muted hover:text-highlighted'")
              | {{ item.label }}

      div(class="min-w-0")
        UCard
          template(#header)
            div(class="flex items-center justify-between gap-3")
              h2(class="text-base sm:text-lg font-semibold") {{ currentTabLabel }}
          component(:is="currentTabComponent" v-if="currentTabComponent")
          UAlert(
            v-else
            color="error"
            variant="soft"
            title="Settings page unavailable"
            description="You do not have access to this section, or the page does not exist."
          )
</template>
