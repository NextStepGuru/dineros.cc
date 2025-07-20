<script setup lang="ts">
definePageMeta({
  middleware: "auth",
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// Define available tabs
const navigationItems = computed(() => {
  const baseItems = [
    {
      label: "Profile",
      to: "/edit-profile/profile",
      active: route.path.startsWith("/edit-profile/profile"),
    },
    {
      label: "Password",
      to: "/edit-profile/password",
      active: route.path.startsWith("/edit-profile/password"),
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

  // Add hidden tabs for userId = 1
  if (authStore.getUser?.id === 1) {
    baseItems.push({
      label: "Admin",
      to: "/edit-profile/admin-settings",
      active: route.path.startsWith("/edit-profile/admin-settings"),
    });
  }

  return baseItems;
});

// Set up page head for SSR
useHead(() => {
  try {
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
  } catch (error) {
    return {
      title: "Edit Profile",
      meta: [
        {
          name: "description",
          content: "Edit your profile settings",
        },
      ],
    };
  }
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

  // Tab Content
  div(class="flex justify-center")
    ProfileEditProfileTab(v-if="route.path === '/edit-profile/profile'")
    ProfileChangePasswordTab(v-if="route.path === '/edit-profile/password'")
    ProfileSyncAccountsTab(v-if="route.path === '/edit-profile/sync-accounts'")
    ProfileTwoFactorAuthTab(v-if="route.path === '/edit-profile/two-factor-auth'")
    // Admin tabs (only visible to userId = 1)
    ProfileAdminSettingsTab(v-if="route.path === '/edit-profile/admin-settings' && authStore.getUser?.id === 1")
    ProfileDebugToolsTab(v-if="route.path === '/edit-profile/debug-tools' && authStore.getUser?.id === 1")
</template>
