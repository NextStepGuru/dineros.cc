<script setup lang="ts">
definePageMeta({
  middleware: "auth",
});

const items = ref([
  {
    label: "Profile",
    slot: "edit-profile",
  },
  {
    label: "Password",
    slot: "change-password",
  },
  { label: "Sync Accounts", slot: "sync-accounts" },
  { label: "2FA", slot: "two-factor-auth" },
]);
</script>

<template lang="pug">
  section(class="flex space-y-4 mt-4 md:flex-row md:space-x-4 md:space-y-0")
    UTabs(orientation="horizontal" :items="items" class="w-full items-center justify-center text-center" variant="link")
      template(#edit-profile)
        ProfileEditProfileTab
      template(#change-password)
        ProfileChangePasswordTab
      template(#sync-accounts)
        ProfileSyncAccountsTab
      template(#two-factor-auth)
        ProfileTwoFactorAuthTab
</template>
