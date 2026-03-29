<script setup lang="ts">
import type { LoginResponse } from "~/lib/auth";
import { getPostLoginRedirect, processLoginResponse } from "~/lib/auth";
import { readWorkflowModeFromStorage } from "~/lib/workflowMode";
import type { User } from "~/types/types";
import { handleError } from "~/lib/utils";

const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const listStore = useListStore();
const $api = useNuxtApp().$api as typeof $fetch;
const authTokenCookie = useCookie<string | undefined>("authToken", {
  secure: false,
  httpOnly: false,
  sameSite: "lax",
  maxAge: 86400,
  path: "/",
});

const token = computed(() => String(route.query.token ?? ""));

type Validate =
  | { valid: false }
  | {
      valid: true;
      accountName: string;
      inviterDisplayName: string;
      expiresAt: string;
      needsPassword: boolean;
      needsName: boolean;
    };

const validation = ref<Validate | null>(null);
const loadError = ref<string | null>(null);
const isLoading = ref(true);

const formState = ref({
  firstName: "",
  lastName: "",
  password: "",
  confirmPassword: "",
});
const isSubmitting = ref(false);

onMounted(async () => {
  if (!token.value) {
    loadError.value = "Missing invite link. Ask for a new invitation.";
    isLoading.value = false;
    return;
  }
  try {
    const res = await $api<Validate>("/api/account-invite/validate", {
      query: { token: token.value },
    });
    validation.value = res;
    if (!res.valid) {
      loadError.value = "This invitation is invalid or has expired.";
    }
  } catch (e) {
    loadError.value = "Could not load invitation.";
    handleError(e instanceof Error ? e : new Error(String(e)), toast);
  } finally {
    isLoading.value = false;
  }
});

async function submit() {
  const v = validation.value;
  if (!v?.valid) return;
  if (
    v.needsName &&
    (!formState.value.firstName.trim() || !formState.value.lastName.trim())
  ) {
    toast.add({
      color: "error",
      description: "First and last name are required.",
    });
    return;
  }
  if (v.needsPassword) {
    const pw = formState.value.password;
    if (!pw || pw.length < 6) {
      toast.add({
        color: "error",
        description: "Password must be at least 6 characters.",
      });
      return;
    }
    if (pw !== formState.value.confirmPassword) {
      toast.add({ color: "error", description: "Passwords do not match." });
      return;
    }
  }
  isSubmitting.value = true;
  try {
    const data = await $api<LoginResponse>("/api/account-invite/accept", {
      method: "POST",
      body: {
        token: token.value,
        ...(v.needsName
          ? {
              firstName: formState.value.firstName.trim(),
              lastName: formState.value.lastName.trim(),
            }
          : {}),
        ...(v.needsPassword
          ? {
              password: formState.value.password,
              confirmPassword: formState.value.confirmPassword,
            }
          : {}),
      },
    });
    const processed = processLoginResponse(data as LoginResponse);
    if (!processed.success || !processed.token) {
      toast.add({
        color: "error",
        description: processed.errorMessage ?? "Accept failed.",
      });
      isSubmitting.value = false;
      return;
    }
    authTokenCookie.value = processed.token;
    authStore.setToken(processed.token);
    if (processed.user) {
      authStore.setUser(processed.user as User);
    }
    await listStore.fetchLists();
    const defaultBudget = listStore.getDefaultBudget;
    if (defaultBudget) authStore.setBudgetId(defaultBudget.id);
    const redirectPath = getPostLoginRedirect(
      listStore.getAccountRegisters,
      readWorkflowModeFromStorage() ?? "forecasting",
    );
    toast.add({
      color: "success",
      description: "Welcome! You have joined the account.",
    });
    globalThis.location.assign(redirectPath);
  } catch (e: unknown) {
    handleError(e instanceof Error ? e : new Error(String(e)), toast);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template lang="pug">
section(class="auth-page flex items-center justify-center")
  AuthFormCard(
    icon="i-lucide-mail-plus"
    title="Accept invitation"
    subtitle="Join a shared Dineros account."
  )
    template(v-if="isLoading")
      p(class="text-center frog-text-muted") Loading invitation…
    template(v-else-if="loadError")
      p(class="text-center text-error") {{ loadError }}
    template(v-else-if="validation && validation.valid")
      p(class="text-center mb-4 text-sm")
        span(class="font-medium") {{ validation.inviterDisplayName }}
        span  invited you to&nbsp;
        span(class="font-medium") {{ validation.accountName }}
        span .
      p(class="text-center text-xs frog-text-muted mb-6")
        | Expires {{ new Date(validation.expiresAt).toLocaleString() }}
      UForm(class="auth-form" @submit.prevent="submit")
        template(v-if="validation.needsName")
          UFormField(label="First Name" name="firstName" for="inviteFirstName")
            UInput(
              id="inviteFirstName"
              v-model="formState.firstName"
              type="text"
              autocomplete="given-name"
              aria-label="First name"
              class="w-full"
            )
          UFormField(label="Last Name" name="lastName" for="inviteLastName")
            UInput(
              id="inviteLastName"
              v-model="formState.lastName"
              type="text"
              autocomplete="family-name"
              aria-label="Last name"
              class="w-full"
            )
        template(v-if="validation.needsPassword")
          UFormField(label="Password" name="password" for="invitePassword")
            UInput(
              id="invitePassword"
              v-model="formState.password"
              type="password"
              autocomplete="new-password"
              aria-label="Password"
              class="w-full"
            )
          UFormField(label="Confirm Password" name="confirmPassword" for="inviteConfirmPassword")
            UInput(
              id="inviteConfirmPassword"
              v-model="formState.confirmPassword"
              type="password"
              autocomplete="new-password"
              aria-label="Confirm password"
              class="w-full"
            )
        UButton(
          color="primary"
          size="lg"
          type="submit"
          block
          :disabled="isSubmitting"
          :loading="isSubmitting"
        ) Join account
    template(v-else)
      p(class="text-center frog-text-muted") This invitation could not be loaded.

    template(#footer)
      div(class="text-sm text-center")
        ULink(to="/login" class="frog-link hover:underline") Sign in
</template>
