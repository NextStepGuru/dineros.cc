<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "admin"],
});

useHead({
  title: "Admin",
  meta: [
    {
      name: "description",
      content: "Admin dashboard for user and account management.",
    },
  ],
});
</script>

<template lang="pug">
AdminPageShell(
  title="Admin"
  description="Manage users, accounts, and operational admin tools.")
  div(class="space-y-6")
    UAlert(
      color="primary"
      variant="soft"
      title="Admin console enabled"
      description="Use the admin navigation to search users and accounts, edit profile details, and reset passwords."
    )
    div(class="grid gap-4 md:grid-cols-2")
      UCard
        template(#header)
          h2(class="text-base font-semibold") User operations
        p(class="text-sm frog-text-muted")
          | Search users, update core profile fields, and set temporary passwords.
        div(class="mt-4")
          UButton(to="/admin/users" color="primary") Go to Users
      UCard
        template(#header)
          h2(class="text-base font-semibold") Account operations
        p(class="text-sm frog-text-muted")
          | Search accounts and inspect account membership details.
        div(class="mt-4")
          UButton(to="/admin/accounts" color="primary") Go to Accounts
</template>
