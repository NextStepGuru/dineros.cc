<script setup lang="ts">
import { handleError } from "~/lib/utils";
import type { FormSubmitEvent } from "@nuxt/ui";
import type { z } from "zod";
import type { Account, PlaidAccount, User } from "../types/types";

import { passwordSchema, publicProfileSchema } from "~/schema/zod";
import {  PlaidLink } from "@jcss/vue-plaid-link";
import type {PlaidLinkOptions} from "@jcss/vue-plaid-link";

definePageMeta({
  middleware: "auth",
});

const toast = useToast(); // Initialize the toast composable
const authStore = useAuthStore();
const listStore = useListStore();

type ProfileSchemaType = z.infer<typeof publicProfileSchema>;
type PasswordSchemaType = z.infer<typeof passwordSchema>;

const formState = ref<Partial<User>>(authStore.getUser || {});
const passwordState = ref<
  Partial<{
    newPassword: string;
    confirmPassword: string;
  }>
>({});

const isLoaded = ref(false);
const isProfileSaving = ref(false);
const isPasswordChanging = ref(false);
const isTwoFaSaving = ref(false);
const publicToken = ref("");

const plaidLinkOptions = ref<PlaidLinkOptions>({
  token: "",
  onSuccess: async (public_token, metadata) => {
    const { data: userResponse } = await useAPI<User>("/api/plaid-link", {
      method: "POST",
      body: { public_token, metadata },
    });

    isLoaded.value = true;
    publicToken.value = public_token;

    if (userResponse.value) {
      authStore.setUser(userResponse.value);
    }
  },
});

// Submit handler
const handleSubmit = async ({
  data: formData,
}: FormSubmitEvent<ProfileSchemaType>) => {
  try {
    isProfileSaving.value = true;
    const { data: responseData, error } = await useAPI<User>("/api/user", {
      method: "POST",
      body: formData,
    });

    if (error?.value) {
      isLoaded.value = false;
      isProfileSaving.value = false;
      toast.add({
        color: "error",
        description: error.value.message || "Profile update failed.",
      });
      return;
    }
    formState.value.firstName = responseData.value?.firstName || "";
    formState.value.lastName = responseData.value?.lastName || "";
    formState.value.email = responseData.value?.email || "";

    toast.add({
      color: "success",
      description: "Profile updated successfully.",
    });
    isProfileSaving.value = false;
  } catch (error) {
    isProfileSaving.value = false;
    toast.add({
      color: "error",
      description:
        error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
          ? error.message
          : "An error occurred during profile update.",
    });
  }
};

const handlePasswordSubmit = async ({
  data: passwordState,
}: FormSubmitEvent<PasswordSchemaType>) => {
  try {
    isPasswordChanging.value = true;
    const { data: responseData, error } = await useAPI<User>(
      "/api/change-password",
      {
        method: "POST",
        body: passwordState,
      }
    );

    if (error?.value) {
      isLoaded.value = false;
      isPasswordChanging.value = false;
      toast.add({
        color: "error",
        description: error.value.message || "Password update failed.",
      });
      return;
    }
    formState.value.firstName = responseData.value?.firstName || "";
    formState.value.lastName = responseData.value?.lastName || "";
    formState.value.email = responseData.value?.email || "";

    toast.add({
      color: "success",
      description: "Password updated successfully.",
    });
    isPasswordChanging.value = false;
  } catch (error) {
    toast.add({
      color: "error",
      description:
        error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
          ? error.message
          : "An error occurred during password update.",
    });
    isPasswordChanging.value = false;
  }
};

async function connectToPlaid() {
  const { data: res } = await useAPI<{
    expiration: string;
    link_token: string;
    request_id: string;
  }>("/api/plaid-link");
  if (res?.value && res.value.link_token) {
    plaidLinkOptions.value.token = res.value.link_token;
  }
}

const twoFaImage = ref("");
const twoFactorCode = ref("");

async function twoFactorAuth() {
  isTwoFaSaving.value = true;
  const { data: res, error } = await useAPI<{
    dataUri: string;
  }>("/api/two-factor-auth");

  if (res?.value && res.value.dataUri && !error?.value) {
    twoFaImage.value = res.value.dataUri;
  } else if (error?.value) {
    toast.add({
      color: "error",
      description: error.value.message || "Two-Factor Authentication failed.",
    });
  }

  isTwoFaSaving.value = false;
}

async function verifyTwoFa() {
  isTwoFaSaving.value = true;
  const { data: res, error } = await useAPI<User>(
    "/api/verify-two-factor-auth",
    {
      method: "POST",
      body: { token: twoFactorCode.value },
    }
  );

  if (res?.value && !error?.value) {
    authStore.setUser(res.value);
  } else if (error?.value) {
    toast.add({
      color: "error",
      description: error.value.message || "Two-Factor Authentication failed.",
    });
  }

  isTwoFaSaving.value = false;
}

async function disable2fa() {
  isTwoFaSaving.value = true;
  const { data: res, error } = await useAPI<User>(
    "/api/disable-two-factor-auth",
    {
      method: "POST",
    }
  );

  if (res?.value && !error?.value) {
    authStore.setUser(res.value);
  } else if (error?.value) {
    toast.add({
      color: "error",
      description:
        error.value.message || "Two-Factor Authentication disabling failed.",
    });
  }
  isTwoFaSaving.value = false;
}

const items = ref([
  {
    label: "Profile",
    slot: "edit-profile",
  },
  {
    label: "Password",
    slot: "change-password",
  },
  { label: "Plaid", slot: "link-plaid" },
  { label: "2FA", slot: "two-factor-auth" },
]);

const plaidAccounts = ref<PlaidAccount[]>([]);
async function loadPlaidData() {
  const { data: res, error } = await useAPI<{ accounts: PlaidAccount[] }>(
    "/api/plaid-list-accounts"
  );

  if (res && res?.value) {
    plaidAccounts.value = res.value.accounts;
  }
}

if (authStore.hasPlaidConnected) {
  loadPlaidData();
}

watch(authStore, () => {
  if (authStore.hasPlaidConnected) {
    loadPlaidData();
  }
});

const selectedAccounts = ref<Record<string, number | null>>({});

// Expose handleError to template
const handleErrorForTemplate = handleError;

type LinkedAccountType = {
  id: number | string | null;
  name: string;
  disabled: boolean;
};

const linkBankAccounts = computed<LinkedAccountType[]>(() => {
  // Create a set of selected accountRegisterIds from selectedAccounts
  const selectedAccountIds = new Set(Object.values(selectedAccounts.value));

  return listStore.getAccountRegisters
    .map((ar): LinkedAccountType => ({
      id: ar.id,
      name: ar.name,
      // Disable the option if the accountRegisterId is in the selectedAccountIds set
      disabled: selectedAccountIds.has(ar.id),
    }))
    .concat([
      { id: 0, name: "Add Bank Account", disabled: false },
      { id: null, name: "Do not link", disabled: false },
    ]);
});

async function linkAccounts() {
  // Transform selectedAccounts into an array of objects
  const linkAccountsArray = Object.entries(selectedAccounts.value)
    .map(([plaidId, accountRegisterId]) => ({
      plaidId,
      accountRegisterId,
    }))
    .filter((account) => account.accountRegisterId !== null);
  const { data: res, error } = await useAPI<User>("/api/plaid-link-accounts", {
    method: "POST",
    body: { linkAccounts: linkAccountsArray },
  });

  if (res?.value && !error?.value) {
    toast.add({
      color: "success",
      description: "Accounts linked successfully.",
    });
    authStore.setUser(res.value);
    listStore.fetchLists();
  } else if (error?.value) {
    toast.add({
      color: "error",
      description: error.value.message || "Account linking failed.",
    });
  }
}
</script>

<template lang="pug">
  section(class="flex space-y-4 mt-4 md:flex-row md:space-x-4 md:space-y-0")
    UTabs(orientation="horizontal" :items="items" class="w-full items-center justify-center text-center" variant="link")
      template(#edit-profile)
        div(class="max-w-md min-h-96 my-4 m-auto")
          h2(class="text-xl font-bold text-center") Edit Profile

          UForm(class="m-4 space-y-4" @submit.prevent="handleSubmit" :state="formState" :schema="publicProfileSchema" @error="handleError($event, toast)" :disabled="isProfileSaving")
            UFormField(label="First Name" for="firstName")
              UInput(
                id="firstName"
                v-model="formState.firstName"
                type="text"
                placeholder="Enter your first name"
                class="w-full"
              )
            UFormField(label="Last Name" for="lastName")
              UInput(
                id="lastName"
                v-model="formState.lastName"
                type="text"
                placeholder="Enter your last name"
                class="w-full"
              )
            UFormField(label="Email Address" for="email")
              UInput(
                id="email"
                v-model="formState.email"
                type="text"
                placeholder="Enter your email"
                required
                class="w-full"
              )
            UButton(
              color="primary"
              size="lg"
              type="submit"
              :disabled="isProfileSaving"
              :loading="isProfileSaving"
            ) Update Profile

      template(#link-plaid)
        div.p-4
          h2(class="text-xl font-bold text-center") Plaid
          .pt-5(v-if="!authStore.hasPlaidConnected")
            UButton(
              color="info"
              size="lg"
              v-if="!plaidLinkOptions.token"
              @click="connectToPlaid()"
            ) Link Plaid
            PlaidLink(v-bind="plaidLinkOptions" v-else-if="!isLoaded")
              UButton(color="primary" size="lg" type="button" block) Connect to Plaid
          .pt-5(v-else="")

            table(class="w-full max-h-[calc(100vh-265px)] overflow-clip")
              thead(class="[&>tr]:after:absolute [&>tr]:after:inset-x-0 [&>tr]:after:bottom-0 [&>tr]:after:h-px [&>tr]:after:bg-[var(--ui-border-accented)] sticky top-0 inset-x-0 bg-[var(--ui-bg)]/75 z-[1] backdrop-blur")
                tr(class="odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700")
                  th.text-left.p-1 Name
                  th.text-left.p-1 Number
                  th
                  th.text-left.p-1 Link Account
              tbody
                tr(
                  v-for="account in plaidAccounts"
                  :key="account.id"
                  class="odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700")

                  td(class="p-4 text-left text-sm text-[var(--ui-text-muted)] whitespace-nowrap [&:has([role=checkbox])]:pe-0") {{ account.name }}
                  td(class="p-4 text-left text-sm text-[var(--ui-text-muted)] whitespace-nowrap [&:has([role=checkbox])]:pe-0") {{ account.mask }}
                  td(class="p-4 text-left text-sm text-[var(--ui-text-muted)] whitespace-nowrap [&:has([role=checkbox])]:pe-0")
                    UIcon(name="lucide:arrow-right-left" class="2x")
                  td(class="p-4 text-left text-sm text-[var(--ui-text-muted)] whitespace-nowrap [&:has([role=checkbox])]:pe-0")
                    USelect(
                      v-model="selectedAccounts[account.id]"
                      :items="linkBankAccounts"
                      value-key="id"
                      label-key="name"
                      class="w-full")
            hr.m-5
            UButton(color="warning" size="lg" @click="linkAccounts") Link Accounts


      template(#two-factor-auth)
        div(class="max-w-md min-h-96 my-4 m-auto")
          h2(class="text-xl font-bold text-center") Two Factor Authentication

          .pt-5(v-if="!authStore.has2faEnabled")
            UForm(:disabled="isTwoFaSaving" :loading="isTwoFaSaving")
              template(v-if="twoFaImage")
                img(:src="twoFaImage" class="mb-4")
                UFormField(label="Code" for="twoFactorCode")
                  UInput(v-model="twoFactorCode" type="text" placeholder="Enter your two-factor authentication code" class="w-full")

                UButton(color="primary" class="mt-4" size="lg" :disabled="isTwoFaSaving" :loading="isTwoFaSaving" @click="verifyTwoFa") Verify
              UButton(v-else="" color="primary" class="mt-4" size="lg" @click="twoFactorAuth()" :disabled="isTwoFaSaving" :loading="isTwoFaSaving") Enable Two-Factor Authentication
          .pt-5(v-else="")
            UButton(color="error" size="lg" @click="disable2fa") Disable Two-Factor Authentication

      template(#change-password)
        div(class="max-w-md min-h-96 my-4 m-auto")
          h2(class="text-xl font-bold text-center") Change Password

          UForm(class="m-4 space-y-4" @submit.prevent="handlePasswordSubmit" :state="passwordState" :schema="passwordSchema" @error="handleError($event, toast)" :disabled="isPasswordChanging")
            UFormField(label="Password" for="newPassword")
              UInput(
                id="newPassword"
                v-model="passwordState.newPassword"
                type="password"
                placeholder="Enter new your password"
                class="w-full"
              )
            UFormField(label="Confirm Password" for="confirmPassword")
              UInput(
                id="confirmPassword"
                v-model="passwordState.confirmPassword"
                type="password"
                placeholder="Confirm your new password"
                class="w-full"
              )
            UButton(
              color="primary"
              size="lg"
              type="submit"
              :disabled="isPasswordChanging"
              :loading="isPasswordChanging"
            ) Update Password

</template>
