<script setup lang="ts">
import { ALL_TIMEZONE_OPTIONS as allTimezoneOptions } from "~/lib/timezoneOptions";

definePageMeta({
  middleware: ["auth", "admin"],
});

const toast = useToast();
const $api = useNuxtApp().$api as typeof $fetch;

type AdminUserRow = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: "USER" | "ADMIN";
  isArchived: boolean;
  countryId: number | null;
  timezoneOffset: number | null;
  isDaylightSaving: boolean | null;
  updatedAt: string;
  accountCount: number;
};

interface Country {
  id: number;
  name: string;
  code: string;
  code3: string;
}

const query = ref("");
const limit = 25;
const offset = ref(0);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const resettingPassword = ref(false);
const items = ref<AdminUserRow[]>([]);
const selectedUserId = ref<number | null>(null);
const resetPasswordForm = reactive({
  newPassword: "",
  confirmPassword: "",
});

const selectedUser = computed(
  () => items.value.find((item) => item.id === selectedUserId.value) ?? null,
);

const editableUser = reactive({
  firstName: "",
  lastName: "",
  email: "",
  role: "USER" as "USER" | "ADMIN",
  countryId: null as number | null,
  timezoneOffset: null as number | null,
  isDaylightSaving: false,
  isArchived: false,
});

const roleOptions = [
  { label: "User", value: "USER" },
  { label: "Admin", value: "ADMIN" },
];

const countries = ref<Country[]>([]);
const isLoadingCountries = ref(true);
const countryOptions = computed(() => {
  if (countries.value.length === 0) {
    return [{ label: "Loading countries...", value: 840 }];
  }
  return countries.value.map((country) => ({
    label: `${country.name} (${country.code})`,
    value: country.id,
  }));
});

const timezoneOptions = computed(() => {
  const selectedCountryId = editableUser.countryId;
  if (!selectedCountryId) return allTimezoneOptions;
  const filteredOptions = allTimezoneOptions.filter((option) =>
    option.countries.includes(selectedCountryId),
  );
  return filteredOptions.length > 0 ? filteredOptions : allTimezoneOptions;
});

watch(
  () => editableUser.countryId,
  (newCountryId) => {
    if (!newCountryId || timezoneOptions.value.length === 0) return;
    const currentIsValid = timezoneOptions.value.some(
      (option) => option.value === editableUser.timezoneOffset,
    );
    if (!currentIsValid) {
      const firstTimezone = timezoneOptions.value[0];
      if (firstTimezone) {
        editableUser.timezoneOffset = firstTimezone.value;
      }
    }
  },
);

async function loadCountries() {
  try {
    isLoadingCountries.value = true;
    const list = await $api<Country[]>("/api/countries");
    if (list?.length > 0) {
      countries.value = list;
    } else {
      countries.value = [
        { id: 840, name: "United States", code: "US", code3: "USA" },
      ];
    }
  } catch {
    countries.value = [
      { id: 840, name: "United States", code: "US", code3: "USA" },
    ];
  } finally {
    isLoadingCountries.value = false;
  }
}

async function loadUsers(reset: boolean) {
  loading.value = true;
  if (reset) {
    offset.value = 0;
    selectedUserId.value = null;
  }
  try {
    const response = await $api<{
      items: AdminUserRow[];
      total: number;
      limit: number;
      offset: number;
    }>("/api/admin/users", {
      query: {
        q: query.value,
        limit,
        offset: reset ? 0 : offset.value,
      },
    });
    total.value = response.total;
    if (reset) {
      items.value = response.items;
    } else {
      items.value = [...items.value, ...response.items];
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to load users.";
    toast.add({
      color: "error",
      description: message,
    });
  } finally {
    loading.value = false;
  }
}

function selectUser(user: AdminUserRow) {
  selectedUserId.value = user.id;
  editableUser.firstName = user.firstName ?? "";
  editableUser.lastName = user.lastName ?? "";
  editableUser.email = user.email;
  editableUser.role = user.role;
  editableUser.countryId = user.countryId ?? 840;
  editableUser.timezoneOffset = user.timezoneOffset ?? -300;
  editableUser.isDaylightSaving = user.isDaylightSaving ?? false;
  editableUser.isArchived = user.isArchived;
}

async function saveUser() {
  if (!selectedUserId.value) return;
  saving.value = true;
  try {
    const updatedUser = await $api<AdminUserRow>(
      `/api/admin/users/${selectedUserId.value}`,
      {
        method: "PATCH",
        body: {
          firstName: editableUser.firstName,
          lastName: editableUser.lastName,
          email: editableUser.email,
          role: editableUser.role,
          countryId: editableUser.countryId,
          timezoneOffset: editableUser.timezoneOffset,
          isDaylightSaving: editableUser.isDaylightSaving,
          isArchived: editableUser.isArchived,
        },
      },
    );

    items.value = items.value.map((user) =>
      user.id === updatedUser.id ? { ...user, ...updatedUser } : user,
    );
    selectUser(updatedUser);
    toast.add({
      color: "success",
      description: "User profile updated.",
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to update user.";
    toast.add({
      color: "error",
      description: message,
    });
  } finally {
    saving.value = false;
  }
}

async function resetPassword() {
  if (!selectedUserId.value) return;
  resettingPassword.value = true;
  try {
    await $api(`/api/admin/users/${selectedUserId.value}/reset-password`, {
      method: "POST",
      body: {
        newPassword: resetPasswordForm.newPassword,
        confirmPassword: resetPasswordForm.confirmPassword,
      },
    });
    resetPasswordForm.newPassword = "";
    resetPasswordForm.confirmPassword = "";
    toast.add({
      color: "success",
      description: "Temporary password set successfully.",
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to reset password.";
    toast.add({
      color: "error",
      description: message,
    });
  } finally {
    resettingPassword.value = false;
  }
}

function clearSearch() {
  query.value = "";
  loadUsers(true);
}

function loadMore() {
  offset.value += limit;
  loadUsers(false);
}

onMounted(() => {
  loadCountries();
  loadUsers(true);
});

useHead({
  title: "Admin Users",
  meta: [
    {
      name: "description",
      content: "Admin user management.",
    },
  ],
});
</script>

<template lang="pug">
AdminPageShell(
  title="Admin Users"
  description="Find users, edit profile details, and reset passwords.")
  div(class="space-y-4")
    div(class="flex flex-wrap items-center gap-2")
      UInput(
        v-model="query"
        placeholder="Search by id, name, or email"
        class="w-full sm:max-w-md"
        @keyup.enter="loadUsers(true)")
      UButton(
        color="primary"
        :loading="loading"
        @click="loadUsers(true)") Search
      UButton(
        variant="outline"
        :disabled="loading"
        @click="clearSearch") Clear

    p(class="text-sm frog-text-muted")
      | Showing {{ items.length }} of {{ total }} users.

    div(class="overflow-x-auto rounded-lg border border-default")
      table(class="w-full text-sm")
        thead(class="bg-elevated")
          tr
            th(class="p-2 text-left") User
            th(class="p-2 text-left") Email
            th(class="p-2 text-left") Role
            th(class="p-2 text-left") Accounts
            th(class="p-2 text-left") Updated
        tbody
          tr(
            v-for="user in items"
            :key="user.id"
            class="cursor-pointer border-t border-default transition-colors hover:bg-elevated/50"
            :class="{ 'bg-primary/10': user.id === selectedUserId }"
            @click="selectUser(user)")
            td(class="p-2")
              div(class="font-medium") {{ [user.firstName, user.lastName].filter(Boolean).join(" ") || `User #${user.id}` }}
              div(class="text-xs frog-text-muted") ID {{ user.id }}
            td(class="p-2") {{ user.email }}
            td(class="p-2")
              UBadge(:color="user.role === 'ADMIN' ? 'warning' : 'neutral'" variant="subtle") {{ user.role }}
            td(class="p-2") {{ user.accountCount }}
            td(class="p-2") {{ new Date(user.updatedAt).toLocaleString() }}

    div(class="flex justify-end")
      UButton(
        v-if="items.length < total"
        :loading="loading"
        :disabled="loading"
        @click="loadMore") Load more

    UAlert(
      v-if="!selectedUser"
      color="neutral"
      variant="soft"
      title="Select a user"
      description="Choose a row above to edit details or reset password."
    )

    div(v-else class="grid gap-4 lg:grid-cols-2")
      UCard
        template(#header)
          h2(class="text-base font-semibold") Edit user
        div(class="space-y-3")
          UFormField(label="First name")
            UInput(v-model="editableUser.firstName")
          UFormField(label="Last name")
            UInput(v-model="editableUser.lastName")
          UFormField(label="Email")
            UInput(v-model="editableUser.email" type="email")
          UFormField(label="Role")
            USelect(
              v-model="editableUser.role"
              :items="roleOptions"
              value-key="value"
              label-key="label")
          UFormField(label="Country")
            USelect(
              v-model="editableUser.countryId"
              :items="countryOptions"
              value-key="value"
              label-key="label"
              :placeholder="isLoadingCountries ? 'Loading countries...' : 'Select country'"
              :disabled="isLoadingCountries")
          UFormField(label="Timezone")
            USelectMenu(
              v-model="editableUser.timezoneOffset"
              :items="timezoneOptions"
              value-key="value"
              label-key="label"
              placeholder="Select timezone")
          UCheckbox(
            v-model="editableUser.isDaylightSaving"
            label="Daylight saving enabled")
          UCheckbox(
            v-model="editableUser.isArchived"
            label="Archived user")
          UButton(
            color="primary"
            :loading="saving"
            :disabled="saving"
            @click="saveUser") Save changes

      UCard
        template(#header)
          h2(class="text-base font-semibold") Reset password
        div(class="space-y-3")
          p(class="text-sm frog-text-muted")
            | Set a temporary password for this user.
          UFormField(label="Temporary password")
            UInput(
              v-model="resetPasswordForm.newPassword"
              type="password"
              autocomplete="new-password")
          UFormField(label="Confirm password")
            UInput(
              v-model="resetPasswordForm.confirmPassword"
              type="password"
              autocomplete="new-password")
          UButton(
            color="warning"
            :loading="resettingPassword"
            :disabled="resettingPassword"
            @click="resetPassword") Set temporary password
</template>
