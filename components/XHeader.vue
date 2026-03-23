<script setup lang="ts">
import type { User, Budget } from "~/types/types";
import { formatAccountRegisters } from "~/lib/utils";
import type { BudgetManagerProps } from "~/components/modals/BudgetManager.vue";

const ModalsBudgetManager = defineAsyncComponent(
  () => import("~/components/modals/BudgetManager.vue"),
);

const authStore = useAuthStore();
const listStore = useListStore();
const toast = useToast();
const route = useRoute();
const overlay = useOverlay();
const budgetModal = overlay.create(ModalsBudgetManager);

const currentBudgetName = computed(
  () =>
    listStore.getBudgets.find((b) => b.id === authStore.getBudgetId)?.name ??
    "Select budget",
);

function selectBudget(id: number) {
  authStore.setBudgetId(id);
  listStore.fetchLists();
  const firstRegister = listStore.getAccountRegisters[0];
  if (firstRegister && route.path.startsWith("/register/")) {
    navigateTo(`/register/${firstRegister.id}`);
  }
}

function openBudgetModal(
  mode: BudgetManagerProps["mode"],
  budget: Budget | null,
) {
  budgetModal.open({
    mode,
    budget,
    callback: () => {
      budgetModal.close();
      listStore.fetchLists();
    },
    cancel: () => budgetModal.close(),
  });
}

function budgetMenuItems(b: Budget) {
  return [
    [
      {
        label: "Rename",
        icon: "i-lucide-pencil",
        onSelect: () => openBudgetModal("rename", b),
      },
      {
        label: "Reset from default",
        icon: "i-lucide-rotate-ccw",
        onSelect: () => openBudgetModal("reset", b),
      },
      {
        label: "Delete",
        icon: "i-lucide-trash-2",
        onSelect: () => openBudgetModal("delete", b),
      },
    ],
  ];
}

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
            ? "/register/" +
              formatAccountRegisters(listStore.getAccountRegisters)[0]?.id
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
        label: "Goals",
        to: "/goals",
        active: route.path.startsWith("/goals"),
      },
      {
        label: "Reports",
        to: "/reports",
        active: route.path.startsWith("/reports"),
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
    ];
  }
});

// Logout: navigate while session is still valid, then clear auth (logout-first can strand on protected route)
async function logout() {
  clearInterval(poller);
  poller = undefined;
  await navigateTo("/");
  await authStore.logout();
}

async function pollData() {
  const $api = useNuxtApp().$api as typeof $fetch;
  try {
    const data = await $api<{ token: string; user?: User }>(
      "/api/validate-token",
    );

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
      description: err?.data?.errors
        ? String(err.data.errors)
        : err?.message || "Login failed.",
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
</script>

<template lang="pug">
UHeader(
  title="DinerosPredictive budgeting"
  :toggle="{ color: 'primary', variant: 'subtle', class: 'rounded-full toolbar-icon-button' }")
  template(#title)
    XLogo(class="h-6 w-auto")

  UNavigationMenu(:items="items"  class="flex flex-col md:flex-row")

  template(#right)
    UPopover(
      v-if="authStore.getIsUserLoggedIn && listStore.getBudgets.length > 0"
      class="my-0 mr-4"
      :content="{ align: 'end', sideOffset: 4 }")
      UButton(
        size="xs"
        variant="soft"
        color="neutral"
        class="min-w-0 max-w-48")
        span.truncate {{ currentBudgetName }}
        UIcon(name="i-lucide-chevron-down" class="ml-1 shrink-0")
      template(#content="{ close }")
        .flex.flex-col.p-1.min-w-48
          div(
            v-for="b in listStore.getBudgets"
            :key="b.id"
            class="flex items-center justify-between gap-2 py-2 px-2 rounded cursor-pointer hover:bg-elevated"
            :class="{ 'bg-primary/15': b.id === authStore.getBudgetId }"
            @click="selectBudget(b.id); close()")
            span.truncate.flex-1 {{ b.name }}
            UBadge(
              v-if="b.isDefault"
              size="xs"
              color="neutral"
              variant="subtle") Default
            UDropdownMenu(
              v-else
              :items="budgetMenuItems(b)"
              @click.stop)
              UButton(
                size="xs"
                icon="i-lucide-more-horizontal"
                square
                variant="ghost"
                color="neutral"
                @click.stop)
          USeparator.my-1
          UButton(
            variant="ghost"
            color="neutral"
            size="sm"
            class="justify-start"
            icon="i-lucide-plus"
            @click="openBudgetModal('create', null); close()") Create budget
    ULink(
      @click="logout"
      data-testid="header-sign-out"
      color="neutral"
      v-if="authStore.getIsUserLoggedIn"
      class="cursor-pointer") Sign out
    ULink(
      to="/edit-profile/profile"
      :class="route.path.startsWith('/edit-profile') ? 'cursor-pointer toolbar-icon-link transition-colors before:transition-colors text-highlighted before:bg-(--ui-bg-elevated)/50' : 'cursor-pointer toolbar-icon-link transition-colors before:transition-colors hover:text-highlighted hover:before:bg-(--ui-bg-elevated)/50'"
      v-if="authStore.getIsUserLoggedIn")
      UIcon(name="lucide:user" class="toolbar-icon")
    UColorModeButton(class="toolbar-icon-button")

  template(#content="{ close }")
    .mobile-menu-container(class="flex h-dvh flex-col overflow-y-auto p-6")
      .mobile-menu-header(class="mb-4 flex w-full max-w-sm items-center justify-end self-center")
        UButton(
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="lg"
          aria-label="Close menu"
          @click="close")
      .mobile-menu-items(class="w-full max-w-sm space-y-4 self-center pb-6")
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
            :class="!item.active ? 'text-white/80! hover:text-white! hover:bg-white/10!' : ''"
            @click="close") {{ item.label }}

        //- Logout button for logged-in users
        UButton(
          v-if="authStore.getIsUserLoggedIn"
          @click="logout(); close()"
          color="error"
          variant="ghost"
          size="lg"
          class="w-full h-16 text-lg font-semibold justify-center mt-8") Sign out

</template>

<style scoped>
.mobile-menu-container {
  background: color-mix(in srgb, var(--frog-surface) 20%, #000 80%);
}

.toolbar-icon-button,
.toolbar-icon-link {
  min-width: 2.5rem;
  min-height: 2.5rem;
}

.toolbar-icon-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.toolbar-icon {
  width: 1.35rem;
  height: 1.35rem;
}

.toolbar-icon-button :deep(svg) {
  width: 1.25rem;
  height: 1.25rem;
}
</style>
