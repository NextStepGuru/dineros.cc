<script setup lang="ts">
const items = [
  {
    label: "About",
    to: "/about",
  },
  {
    label: "Contact",
    to: "/contact",
  },
  {
    label: "Terms",
    to: "/terms-of-service",
  },
  {
    label: "Privacy",
    to: "/privacy-policy",
  },
  {
    label: "Do Not Sell",
    to: "/privacy-policy#california-privacy-rights",
  },
];
</script>

<template lang="pug">
UFooter(class="max-sm:hidden border-t border-default")
  template(#left)
    .flex.items-center.gap-2
      XLogo(class="h-5 w-auto opacity-60")
      span(class="text-xs frog-text-muted") &copy; {{ new Date().getFullYear() }} Forecast with confidence.

  UNavigationMenu(:items="items" variant="link")

  template(#right)
    UButton(
      icon="i-simple-icons-x"
      color="neutral"
      variant="ghost"
      to="https://x.com/dineroscc"
      target="_blank"
      aria-label="X")
</template>
