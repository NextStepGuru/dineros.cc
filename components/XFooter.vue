<script setup lang="ts">
// Navigation items for footer
const items = [
  {
    label: "Terms of Service",
    to: "/terms-of-service",
  },
  {
    label: "Privacy Policy",
    to: "/privacy-policy",
  },
];
</script>

<template lang="pug">
UFooter(class="max-sm:hidden")
  template(#left)
    p.text.text-sm Copyright &copy; {{ new Date().getFullYear() }}

  UNavigationMenu(:items="items" variant="link" class="")

  template(#right)
    UButton(
      icon="i-simple-icons-x"
      color="neutral"
      variant="ghost"
      to="https://x.com/nextstepguru"
      target="_blank"
      aria-label="X")

</template>
