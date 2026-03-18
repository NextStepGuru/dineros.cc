<script setup lang="ts">
const error = useError();

const statusCode = computed(() => error.value?.statusCode ?? 500);
const statusMessage = computed(
  () => error.value?.statusMessage || "Something went wrong."
);

async function goHome() {
  await clearError({ redirect: "/" });
}

async function goLogin() {
  await clearError({ redirect: "/login" });
}
</script>

<template lang="pug">
section(class="min-h-[calc(100dvh-var(--ui-header-height))] flex items-center justify-center px-4")
  UCard(class="w-full max-w-xl")
    template(#header)
      div(class="flex items-center gap-3")
        UIcon(name="i-lucide-triangle-alert" class="text-error size-6")
        h1(class="text-xl font-semibold") We hit a snag
    div(class="space-y-3")
      p(class="frog-text-muted")
        span(class="font-semibold") Error {{ statusCode }}:
        span &nbsp;{{ statusMessage }}
      p(class="frog-text-muted")
        | Try returning home, signing in again, or contacting support if this keeps happening.
      div(class="flex flex-wrap gap-3 pt-2")
        UButton(color="primary" @click="goHome") Go home
        UButton(variant="soft" @click="goLogin") Go to login
        UButton(variant="ghost" to="/contact") Contact support
</template>
