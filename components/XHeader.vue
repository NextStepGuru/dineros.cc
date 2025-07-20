<script setup lang="ts">
/* eslint-env node */
import type { User } from "~/types/types";

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
        to: `/register${
          listStore.getAccountRegisters.length
            ? "/" + listStore.getAccountRegisters[0].id
            : ""
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
        label: "Login",
        to: "/login",
        active: route.path.startsWith("/login"),
      },
      {
        label: "Register",
        to: "/signup",
        active: route.path.startsWith("/signup"),
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
  const { data, error } = await useAPI<{
    token: string;
    user?: User | null | undefined;
    message?: null;
    errors?: { message: string }[];
  }>("/api/validate-token");

  if (error.value) {
    toast.add({
      color: "error",
      description:
        error.value.data.errors || error.value?.message || "Login failed.",
    });

    return;
  }

  if (data?.value && "token" in data.value) {
    const token = data.value.token;

    // Store the token in a cookie
    authTokenCookie.value = token;
    authStore.setToken(token);

    if (data.value.user) {
      authStore.setUser(data.value.user);
    }
  } else {
    toast.add({
      color: "error",
      description: "Invalid login credentials.",
    });

    return;
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
UHeader(:toggle="{ color: 'primary', variant: 'subtle', class: 'rounded-full' }")
  template(#title)
    XLogo(class="h-6 w-auto")

  UNavigationMenu(:items="items"  class="flex flex-col md:flex-row")

  template(#right)
    USelect(
      v-if="authStore.getIsUserLoggedIn && listStore.getBudgets.length > 1"
      v-model="selectedBudgetId"
      size="xs"
      class="my-0 mr-4"
      placeholder="Select a Budget"
      :items="listStore.getBudgets"
      valueKey="id"
      labelKey="name")
    ULink(
      @click="logout"
      color="neutral"
      v-if="authStore.getIsUserLoggedIn"
      class="cursor-pointer") Logout
    ULink(
      to="/edit-profile/profile"
      :class="route.path.startsWith('/edit-profile') ? 'cursor-pointer transition-colors before:transition-colors text-[var(--ui-text-highlighted)] before:bg-[var(--ui-bg-elevated)]/50' : 'cursor-pointer transition-colors before:transition-colors hover:text-[var(--ui-text-highlighted)] hover:before:bg-[var(--ui-bg-elevated)]/50'"
      v-if="authStore.getIsUserLoggedIn")
      UIcon(name="lucide:user" class="2x")
    UColorModeButton

  template(#content)
    .mobile-menu-container(class="flex flex-col items-center justify-center min-h-screen bg-gray-900/95 p-8")
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
          class="w-full h-16 text-lg font-semibold justify-center mt-8") Logout

</template>
