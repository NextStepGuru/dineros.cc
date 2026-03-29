<script setup lang="ts">
import type { User, Budget } from "~/types/types";
import { formatAccountRegisters } from "~/lib/utils";
import type { BudgetManagerProps } from "~/components/modals/BudgetManager.vue";
import {
  NOTIFICATIONS_REFRESH_EVENT,
  type NotificationsRefreshDetail,
} from "~/lib/notifications";

const ModalsBudgetManager = defineAsyncComponent(
  () => import("~/components/modals/BudgetManager.vue"),
);

const authStore = useAuthStore();
const listStore = useListStore();
const toast = useToast();
const route = useRoute();
const { workflowMode, setWorkflowMode } = useWorkflowMode();
const { $api } = useNuxtApp();
const overlay = useOverlay();
const budgetModal = overlay.create(ModalsBudgetManager);
const notificationCount = useNotificationCount();

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

const registerHref = computed(() => {
  const sorted = formatAccountRegisters(listStore.getAccountRegisters);
  const firstId = sorted[0]?.id;
  return firstId ? `/register/${firstId}` : "/account-registers?onboarding=1";
});

type LoggedInNavItem = {
  label: string;
  to: string;
  active: boolean;
};

const adminNavItems = computed((): LoggedInNavItem[] =>
  authStore.getUser?.role === "ADMIN"
    ? [
        {
          label: "Admin",
          to: "/admin",
          active: route.path.startsWith("/admin"),
        },
      ]
    : [],
);

/** Forecast dropdown: planning + forecast reports. */
const forecastingPagesDropdownItems = computed((): LoggedInNavItem[] => [
  {
    label: "Register",
    to: registerHref.value,
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
    label: "Reports",
    to: "/reports",
    active: route.path.startsWith("/reports"),
  },
]);

/** Reconcile dropdown: statement flow + bills + goals. */
const reconciliationPagesDropdownItems = computed((): LoggedInNavItem[] => [
  {
    label: "Reconciliation",
    to: "/reconciliation",
    active: route.path.startsWith("/reconciliation"),
  },
  {
    label: "Register",
    to: registerHref.value,
    active: route.path.startsWith("/register"),
  },
  {
    label: "Bills",
    to: "/bills",
    active: route.path.startsWith("/bills"),
  },
  {
    label: "Goals",
    to: "/goals",
    active: route.path.startsWith("/goals"),
  },
]);

/** Top-level only: Help + Admin (Reports lives under Forecast). */
const topLevelNavItems = computed((): LoggedInNavItem[] => [
  {
    label: "Help",
    to: "/help",
    active: route.path.startsWith("/help"),
  },
  ...adminNavItems.value,
]);

function navIconForLabel(label: string): string {
  const m: Record<string, string> = {
    Register: "i-lucide-table-properties",
    Accounts: "i-lucide-wallet",
    Recurring: "i-lucide-repeat",
    Bills: "i-lucide-receipt",
    Goals: "i-lucide-target",
    Reports: "i-lucide-pie-chart",
    Help: "i-lucide-circle-help",
    Admin: "i-lucide-shield-check",
    Reconciliation: "i-lucide-clipboard-check",
  };
  return m[label] ?? "i-lucide-file-text";
}

function navToForecast(to: string) {
  setWorkflowMode("forecasting");
  void navigateTo(to);
}

function navToReconcile(to: string) {
  setWorkflowMode("reconciliation");
  void navigateTo(to);
}

const forecastDropdownMenuItems = computed(() => [
  forecastingPagesDropdownItems.value.map((it) => ({
    label: it.label,
    icon: navIconForLabel(it.label),
    onSelect: () => navToForecast(it.to),
  })),
]);

const reconcileDropdownMenuItems = computed(() => [
  reconciliationPagesDropdownItems.value.map((it) => ({
    label: it.label,
    icon: navIconForLabel(it.label),
    onSelect: () => navToReconcile(it.to),
  })),
]);

/** Sync workflow highlight with URL (bookmark / direct navigation). */
watch(
  () => route.path,
  (p) => {
    if (!authStore.getIsUserLoggedIn) return;
    if (
      p.startsWith("/reconciliation") ||
      p.startsWith("/bills") ||
      p.startsWith("/goals")
    ) {
      setWorkflowMode("reconciliation");
      return;
    }
    if (
      p.startsWith("/reoccurrences") ||
      p.startsWith("/account-registers") ||
      p.startsWith("/reports")
    ) {
      setWorkflowMode("forecasting");
    }
  },
  { immediate: true },
);

const guestNavItems = computed(() => [
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
]);

// Logout: navigate while session is still valid, then clear auth (logout-first can strand on protected route)
async function logout() {
  clearInterval(poller);
  poller = undefined;
  await navigateTo("/");
  await authStore.logout();
}

async function pollData() {
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

async function refreshNotificationCount() {
  if (!authStore.getIsUserLoggedIn || !authStore.getBudgetId) {
    notificationCount.value = 0;
    return;
  }
  try {
    const result = await ($api as typeof $fetch)<{ count: number }>(
      "/api/notifications/count",
      {
        query: { budgetId: authStore.getBudgetId, daysAhead: 90 },
      },
    );
    notificationCount.value = result.count ?? 0;
  } catch {
    notificationCount.value = 0;
  }
}

function onNotificationsRefresh(event: Event) {
  const maybeCustom = event as CustomEvent<NotificationsRefreshDetail>;
  const count = maybeCustom?.detail?.count;
  if (typeof count === "number") {
    notificationCount.value = Math.max(0, count);
    return;
  }
  refreshNotificationCount();
}

let poller: ReturnType<typeof setInterval> | undefined;
function start() {
  poller = setInterval(pollData, 1000 * 60 * 10); // 10 minutes);
}

function stop() {
  clearInterval(poller);
  poller = undefined;
}

watch(
  () => authStore.getIsUserLoggedIn,
  (isLoggedIn) => {
    if (isLoggedIn && !poller) {
      start();
      refreshNotificationCount();
    } else if (poller && !isLoggedIn) {
      stop();
      notificationCount.value = 0;
    }
  },
);

watch(
  () => authStore.getBudgetId,
  () => {
    refreshNotificationCount();
  },
);

onMounted(() => {
  // Set up the interval to poll every 10 minutes
  if (authStore.getIsUserLoggedIn && !poller) {
    start();
    refreshNotificationCount();
  }
  if (import.meta.client) {
    globalThis.addEventListener(
      NOTIFICATIONS_REFRESH_EVENT,
      onNotificationsRefresh,
    );
  }
});

onBeforeUnmount(() => {
  // Clear the interval when the component is unmounted
  if (poller) {
    stop();
  }
  if (import.meta.client) {
    globalThis.removeEventListener(
      NOTIFICATIONS_REFRESH_EVENT,
      onNotificationsRefresh,
    );
  }
});
</script>

<template lang="pug">
UHeader(
  title="DinerosPredictive budgeting"
  :toggle="{ color: 'primary', variant: 'subtle', class: 'rounded-full toolbar-icon-button' }")
  template(#title)
    XLogo(class="h-6 w-auto")

  template(v-if="authStore.getIsUserLoggedIn")
    div(class="flex flex-row flex-wrap items-center gap-1.5 sm:gap-2 min-w-0")
      //- Two workspace menus (no separate tab strip)
      div(class="hidden md:flex items-center gap-1 shrink-0")
        UDropdownMenu(
          :items="forecastDropdownMenuItems"
          :content="{ align: 'start', sideOffset: 4, class: 'e2e-forecast-workspace-dropdown' }")
          UButton(
            variant="soft"
            :color="workflowMode === 'forecasting' ? 'primary' : 'neutral'"
            size="sm"
            trailing-icon="i-lucide-chevron-down"
            class="h-8"
            aria-haspopup="menu"
            aria-label="Forecast menu"
            data-testid="header-forecast-menu-trigger")
            UIcon(name="i-lucide-line-chart" class="size-4 shrink-0 opacity-80")
            span Forecast
        UDropdownMenu(
          :items="reconcileDropdownMenuItems"
          :content="{ align: 'start', sideOffset: 4, class: 'e2e-reconcile-workspace-dropdown' }")
          UButton(
            variant="soft"
            :color="workflowMode === 'reconciliation' ? 'primary' : 'neutral'"
            size="sm"
            trailing-icon="i-lucide-chevron-down"
            class="h-8"
            aria-haspopup="menu"
            aria-label="Reconcile menu"
            data-testid="header-reconcile-menu-trigger")
            UIcon(name="i-lucide-clipboard-check" class="size-4 shrink-0 opacity-80")
            span Reconcile
        UButton(
          v-for="it in topLevelNavItems"
          :key="it.label"
          :to="it.to"
          variant="soft"
          :color="it.active ? 'primary' : 'neutral'"
          size="sm"
          class="h-8 gap-1.5 px-2 sm:px-2.5"
          :aria-label="it.label"
          :aria-current="it.active ? 'page' : undefined")
          UIcon(:name="navIconForLabel(it.label)" class="size-4 shrink-0 opacity-80")
          span {{ it.label }}
  UNavigationMenu(v-else :items="guestNavItems" class="flex flex-col md:flex-row")

  template(#right)
    UPopover(
      v-if="authStore.getIsUserLoggedIn"
      class="my-0 mr-2 hidden lg:block"
      :content="{ align: 'end', sideOffset: 4 }")
      UButton(
        variant="ghost"
        color="neutral"
        square
        :aria-label="`User menu, current budget ${currentBudgetName}`"
        data-testid="header-user-menu"
        class="toolbar-icon-button relative")
        UIcon(name="lucide:user" class="toolbar-icon")
        UBadge(
          v-if="notificationCount > 0"
          color="error"
          variant="solid"
          size="xs"
          class="notification-indicator absolute -top-1 -right-1 min-w-4 h-4 px-1 leading-none flex items-center justify-center")
          | {{ notificationCount > 99 ? '99+' : notificationCount }}
      template(#content="{ close }")
        .flex.flex-col.p-1.min-w-64.max-w-80
          .px-2.pt-2.pb-1.text-xs.frog-text-muted Budget
          .max-h-52.overflow-auto
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
                  :aria-label="`Budget options for ${b.name}`"
                  @click.stop)
          UButton(
            variant="ghost"
            color="neutral"
            size="sm"
            class="justify-start mt-1"
            icon="i-lucide-plus"
            @click="openBudgetModal('create', null); close()") Create budget
          USeparator.my-1
          UButton(
            to="/notifications"
            variant="ghost"
            color="neutral"
            size="sm"
            class="justify-between"
            @click="close")
            .flex.items-center.gap-2
              UIcon(name="lucide:bell")
              span Notifications
            UBadge(
              v-if="notificationCount > 0"
              color="error"
              variant="solid"
              size="xs"
              class="notification-indicator")
              | {{ notificationCount > 99 ? '99+' : notificationCount }}
          UButton(
            to="/help"
            variant="ghost"
            color="neutral"
            size="sm"
            class="justify-start"
            icon="i-lucide-circle-help"
            @click="close") Help
          UButton(
            to="/edit-profile/profile"
            variant="ghost"
            color="neutral"
            size="sm"
            class="justify-start"
            icon="lucide:user-cog"
            @click="close") Settings
          .flex.items-center.justify-between.rounded.px-2.py-1
            .flex.items-center.gap-2
              UIcon(name="i-lucide-moon-star")
              span.text-sm Theme
            UColorModeButton(class="toolbar-icon-button" data-testid="header-color-mode")
          UButton(
            data-testid="header-sign-out"
            variant="ghost"
            color="error"
            size="sm"
            class="justify-start"
            icon="i-lucide-log-out"
            @click="logout(); close()") Sign out
    UColorModeButton(v-else class="toolbar-icon-button hidden lg:inline-flex")

  template(#content="{ close }")
    .mobile-menu-container(class="flex h-dvh flex-col overflow-y-auto overflow-x-hidden px-4 pb-6 pt-4")
      .mobile-menu-header(class="mb-4 flex w-full shrink-0 justify-end")
        UButton(
          icon="i-lucide-x"
          color="neutral"
          variant="soft"
          size="lg"
          class="mobile-close-button"
          aria-label="Close menu"
          @click="close")
      .mobile-menu-items(class="flex w-full max-w-md flex-col gap-3 self-center pb-4")
        section(
          v-if="authStore.getIsUserLoggedIn"
          class="mobile-menu-card flex w-full flex-col gap-2")
          .mobile-card-title Forecast
          UButton(
            v-for="it in forecastingPagesDropdownItems"
            :key="`m-fc-${it.label}`"
            variant="soft"
            :color="it.active ? 'primary' : 'neutral'"
            size="lg"
            class="mobile-nav-button w-full min-w-0 justify-start gap-2"
            :aria-current="it.active ? 'page' : undefined"
            @click="navToForecast(it.to); close()")
            UIcon(:name="navIconForLabel(it.label)" class="size-4 shrink-0 opacity-80")
            span {{ it.label }}

        section(
          v-if="authStore.getIsUserLoggedIn"
          class="mobile-menu-card flex w-full flex-col gap-2")
          .mobile-card-title Reconcile
          UButton(
            v-for="it in reconciliationPagesDropdownItems"
            :key="`m-rc-${it.label}`"
            variant="soft"
            :color="it.active ? 'primary' : 'neutral'"
            size="lg"
            class="mobile-nav-button w-full min-w-0 justify-start gap-2"
            :aria-current="it.active ? 'page' : undefined"
            @click="navToReconcile(it.to); close()")
            UIcon(:name="navIconForLabel(it.label)" class="size-4 shrink-0 opacity-80")
            span {{ it.label }}

        section(
          v-if="authStore.getIsUserLoggedIn"
          class="mobile-menu-card flex w-full flex-col gap-2")
          .mobile-card-title More
          UButton(
            v-for="item in topLevelNavItems"
            :key="item.label"
            :to="item.to"
            variant="soft"
            :color="item.active ? 'primary' : 'neutral'"
            size="lg"
            class="mobile-nav-button w-full min-w-0 justify-start gap-2"
            :aria-current="item.active ? 'page' : undefined"
            @click="close")
            UIcon(:name="navIconForLabel(item.label)" class="size-4 shrink-0 opacity-80")
            span {{ item.label }}

        section(
          v-else
          class="mobile-menu-card flex w-full flex-col gap-2")
          .mobile-card-title Menu
          UButton(
            v-for="item in guestNavItems"
            :key="item.label"
            :to="item.to"
            :color="item.active ? 'primary' : 'neutral'"
            :variant="item.active ? 'solid' : 'soft'"
            size="lg"
            class="mobile-nav-button w-full min-w-0 justify-start"
            @click="close") {{ item.label }}

        div(
          v-if="authStore.getIsUserLoggedIn"
          class="mobile-menu-card flex w-full flex-col gap-2")
          div(class="mobile-card-title") Account
          UButton(
            to="/notifications"
            variant="soft"
            color="neutral"
            size="lg"
            class="mobile-nav-button w-full justify-between"
            @click="close")
            .flex.items-center.gap-2
              UIcon(name="lucide:bell")
              span Notifications
            UBadge(
              v-if="notificationCount > 0"
              color="error"
              variant="solid"
              size="xs"
              class="notification-indicator")
              | {{ notificationCount > 99 ? '99+' : notificationCount }}
          UButton(
            to="/edit-profile/profile"
            variant="soft"
            color="neutral"
            size="lg"
            class="mobile-nav-button w-full justify-start"
            icon="lucide:user-cog"
            @click="close") Settings
          .mobile-theme-row
            .flex.items-center.gap-2
              UIcon(name="i-lucide-moon-star")
              span Theme
            UColorModeButton(class="toolbar-icon-button")

        div(
          v-if="authStore.getIsUserLoggedIn && listStore.getBudgets.length > 0"
          class="mobile-menu-card flex w-full flex-col gap-2")
          div(class="mobile-card-title") Budgets
          .max-h-52.flex.flex-col.gap-2.overflow-auto
            div(
              v-for="b in listStore.getBudgets"
              :key="`mobile-budget-${b.id}`"
              class="flex min-w-0 items-center gap-2")
              UButton(
                variant="soft"
                color="neutral"
                size="lg"
                class="mobile-nav-button min-w-0 flex-1 justify-between"
                :class="{ 'bg-primary/20': b.id === authStore.getBudgetId }"
                @click="selectBudget(b.id); close()")
                span.truncate {{ b.name }}
                UBadge(
                  v-if="b.isDefault"
                  size="xs"
                  color="neutral"
                  variant="subtle") Default
              UDropdownMenu(
                v-if="!b.isDefault"
                :items="budgetMenuItems(b)"
                @click.stop)
                UButton(
                  size="sm"
                  icon="i-lucide-more-horizontal"
                  square
                  variant="ghost"
                  color="neutral"
                  class="shrink-0"
                  :aria-label="`Budget options for ${b.name}`"
                  @click.stop)
          UButton(
            variant="soft"
            color="neutral"
            size="lg"
            class="mobile-nav-button w-full justify-start"
            icon="i-lucide-plus"
            @click="openBudgetModal('create', null); close()") Create budget

        UButton(
          v-if="authStore.getIsUserLoggedIn"
          @click="logout(); close()"
          color="error"
          variant="soft"
          size="lg"
          class="mobile-signout-button w-full justify-center") Sign out

</template>

<style scoped>
.mobile-menu-container {
  background:
    radial-gradient(
      120% 90% at 90% -20%,
      rgb(59 130 246 / 18%),
      transparent 60%
    ),
    radial-gradient(
      120% 90% at -10% 100%,
      rgb(16 185 129 / 14%),
      transparent 60%
    ),
    color-mix(in srgb, var(--frog-surface) 30%, #000 70%);
}

.mobile-menu-card {
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 1.1rem;
  padding: 0.85rem;
  background: rgb(255 255 255 / 5%);
  backdrop-filter: blur(14px);
}

.mobile-card-title {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(255 255 255 / 62%);
}

.mobile-theme-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 0.9rem;
  padding: 0.45rem 0.6rem;
  background: rgb(255 255 255 / 4%);
}

.mobile-close-button {
  border-radius: 9999px;
}

.mobile-nav-button {
  min-height: 3.25rem;
  border-radius: 1rem;
  padding-inline: 1rem;
  font-size: 1.04rem;
  font-weight: 600;
}

.mobile-signout-button {
  min-height: 3rem;
  border-radius: 1rem;
  font-size: 1.05rem;
  font-weight: 600;
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

.notification-indicator {
  background-color: rgb(220 38 38);
  color: rgb(255 255 255);
}
</style>
