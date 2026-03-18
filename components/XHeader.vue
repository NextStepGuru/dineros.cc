<script setup lang="ts">
import type { User } from "~/types/types";
import { formatAccountRegisters } from "~/lib/utils";

const authStore = useAuthStore();
const listStore = useListStore();
const toast = useToast();
const route = useRoute();

const authTokenCookie = useCookie("authToken", {
  secure: false,
  httpOnly: false,
  sameSite: "lax",
  maxAge: 86400, // 24 hours
  path: "/",
});

const items = computed(() => {
  if (authStore.getIsUserLoggedIn) {
    // Items for logged-in users
    return [
      {
        label: "Register",
        to: `${
          listStore.getAccountRegisters.length
            ? "/register/" + formatAccountRegisters(listStore.getAccountRegisters)[0]?.id
            : "/account-registers?onboarding=1"
        }`,
        active: route.path.startsWith("/register"),
      },
      {
        label: "Accounts",
        to: "/account-registers",
        active: route.path.startsWith("/account-registers"),
      },
      {
        label: "Recurring",
        to: "/reoccurrences",
        active: route.path.startsWith("/reoccurrences"),
      },
      {
        label: "Help",
        to: "/help",
        active: route.path.startsWith("/help"),
      },
    ];
  } else {
    // Items for not logged-in users
    return [
      {
        label: "Home",
        to: "/",
        active: route.path === "/",
      },
      {
        label: "About",
        to: "/about",
        active: route.path.startsWith("/about"),
      },
      {
        label: "Contact",
        to: "/contact",
        active: route.path.startsWith("/contact"),
      },
      {
        label: "Create account",
        to: "/signup",
        active: route.path.startsWith("/signup"),
      },
      {
        label: "Help",
        to: "/help",
        active: route.path.startsWith("/help"),
      },
    ];
  }
});

// Logout function
function logout() {
  navigateTo("/");
  clearInterval(poller);
  authStore.logout();
}

async function pollData() {
  const $api = useNuxtApp().$api as typeof $fetch;
  try {
    const data = await $api<{ token: string; user?: User }>("/api/validate-token");

    if (data && "token" in data) {
      const token = data.token;
      authTokenCookie.value = token;
      authStore.setToken(token);
      if (data.user) {
        authStore.setUser(data.user);
      }
    } else {
      toast.add({
        color: "error",
        description: "Invalid login credentials.",
      });
    }
  } catch (e: unknown) {
    const err = e as { data?: { errors?: unknown }; message?: string };
    toast.add({
      color: "error",
      description: err?.data?.errors ? String(err.data.errors) : err?.message || "Login failed.",
    });
  }
}

let poller;

function start() {
  poller = setInterval(pollData, 1000 * 60 * 10); // 10 minutes);
}

function stop() {
  clearInterval(poller);
  poller = undefined;
}

watch(authStore, () => {
  if (authStore.getIsUserLoggedIn && !poller) {
    start();
  } else if (poller && !authStore.getIsUserLoggedIn) {
    stop();
  }
});

onMounted(() => {
  // Set up the interval to poll every 10 minutes
  if (authStore.getIsUserLoggedIn && !poller) {
    start();
  }
});

onBeforeUnmount(() => {
  // Clear the interval when the component is unmounted
  if (!poller) {
    stop();
  }
});
const selectedBudgetId = computed({
  get: () => authStore.getBudgetId,
  set: (value) => authStore.setBudgetId(value),
});
</script>

<template lang="pug">
UHeader(
  title="DinerosPredictive budgeting"
  :toggle="{ color: 'primary', variant: 'subtle', class: 'rounded-full' }")
  template(#title)
    XLogo(class="h-6 w-auto")

  UNavigationMenu(:items="items"  class="flex flex-col md:flex-row")

  template(#right)
    USelect(
      v-if="authStore.getIsUserLoggedIn && listStore.getBudgets.length > 1"
      v-model="selectedBudgetId"
      size="xs"
      class="my-0 mr-4"
      placeholder="Select budget"
      :items="listStore.getBudgets"
      valueKey="id"
      labelKey="name")
    ULink(
      @click="logout"
      color="neutral"
      v-if="authStore.getIsUserLoggedIn"
      class="cursor-pointer") Sign out
    ULink(
      to="/edit-profile/profile"
      :class="route.path.startsWith('/edit-profile') ? 'cursor-pointer transition-colors before:transition-colors text-highlighted before:bg-(--ui-bg-elevated)/50' : 'cursor-pointer transition-colors before:transition-colors hover:text-highlighted hover:before:bg-(--ui-bg-elevated)/50'"
      v-if="authStore.getIsUserLoggedIn")
      UIcon(name="lucide:user" class="2x")
    UColorModeButton

  template(#content)
    .mobile-menu-container(class="flex flex-col items-center justify-center min-h-screen p-8")
      .mobile-menu-items(class="w-full max-w-sm space-y-4")
        .mobile-menu-item(
          v-for="item in items"
          :key="item.label"
          class="w-full")
          UButton(
            :to="item.to"
            :color="item.active ? 'primary' : 'neutral'"
            :variant="item.active ? 'solid' : 'ghost'"
            size="lg"
            class="w-full h-16 text-lg font-semibold justify-center"
            @click="$emit('close')") {{ item.label }}

        //- Logout button for logged-in users
        UButton(
          v-if="authStore.getIsUserLoggedIn"
          @click="logout"
          color="error"
          variant="ghost"
          size="lg"
          class="w-full h-16 text-lg font-semibold justify-center mt-8") Sign out

</template>

<style scoped>
.mobile-menu-container {
  background: color-mix(in srgb, var(--frog-surface) 20%, #000 80%);
}
</style>
