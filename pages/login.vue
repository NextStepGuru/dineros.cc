<script setup lang="ts">
import type { z } from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { handleError } from "~/lib/utils";
import { loginSchema } from "~/schema/zod";
import type { User } from "~/types/types";
import type {
   LoginResponse
} from "~/lib/auth";
import {
  processLoginResponse,
  formatLoginError,
  getPostLoginRedirect,
} from "~/lib/auth";

const authStore = useAuthStore();
const listStore = useListStore();
const toast = useToast();
const route = useRoute();

type LoginSchemaType = z.infer<typeof loginSchema>;

const formState = ref<Partial<LoginSchemaType>>({ email: "", password: "" });

const isSaving = ref(false);
const tokenChallengeRequired = ref(false);
const loginFormRef = ref< { submit: () => void } | null>(null);

function onLoginClick() {
  const form = loginFormRef.value as { submit?: () => void } | null;
  if (typeof form?.submit === "function") {
    form.submit();
  } else {
    // Fallback: UForm submit event may not fire inside ClientOnly; call handler with current state
    handleSubmit({ data: { ...formState.value } } as FormSubmitEvent<LoginSchemaType>);
  }
}

function onFormError(event: Parameters<typeof handleError>[0]) {
  handleError(event, toast);
}

onMounted(() => {
  if (route.query.toast && typeof route.query.toast === "string") {
    toast.add({
      color: "error",
      description: route.query.toast,
    });
  }
});

// Cookie for storing the auth token
const authTokenCookie = useCookie("authToken", {
  secure: false,
  httpOnly: false,
  sameSite: "lax",
  maxAge: 86400, // 24 hours
  path: "/",
});

// Submit handler - use $fetch (not useAPI) when already mounted to avoid Nuxt 4 warning
const handleSubmit = async ({
  data: formData,
}: FormSubmitEvent<LoginSchemaType>) => {
  try {
    isSaving.value = true;
    const $api = useNuxtApp().$api as typeof $fetch;
    let data: LoginResponse | null = null;
    let err: { value?: { statusCode?: number; data?: unknown } } = { value: undefined };
    try {
      data = (await $api("/api/login", {
        method: "POST",
        body: formData,
      })) as LoginResponse;
    } catch (e: unknown) {
      err.value = e as { statusCode?: number; data?: unknown };
    }

    if (err.value) {
      isSaving.value = false;
      toast.add({
        color: "error",
        description: formatLoginError(err.value),
      });
      return;
    }

    // Use our testable login response processor
    const result = processLoginResponse(data as LoginResponse);

    if (result.success && result.token) {
      // Store the token in a cookie
      authTokenCookie.value = result.token;
      authStore.setToken(result.token);

      if (result.user) {
        authStore.setUser(result.user);
      }

      // Fetch lists and redirect using testable logic
      await listStore.fetchLists();
      const budgets = listStore.getBudgets;
      authStore.setBudgetId(listStore.getBudgets[0].id);
      const redirectPath = getPostLoginRedirect(listStore.getAccountRegisters);
      toast.add({ color: "success", description: "Login successful!" });
      // Full-page navigation to avoid Nuxt payload client throwing on undefined manifest (prerendered check)
      window.location.assign(redirectPath);
      return;

    } else if (result.requiresTwoFactor) {
      isSaving.value = false;
      tokenChallengeRequired.value = true;
    } else {
      isSaving.value = false;
      toast.add({
        color: "error",
        description: result.errorMessage || "Invalid login credentials.",
      });
    }
  } catch (error) {
    isSaving.value = false;
    console.error("Error during login:", error);
    toast.add({
      color: "error",
      description: "An error occurred during login.",
    });
  }
};
</script>

<template lang="pug">
  section(class="flex items-center justify-center min-h-screen")
    ClientOnly
      UCard(class="w-full max-w-md p-6 rounded-lg shadow-md")
        template(#header)
          h2(class="text-xl font-bold text-center") Login to Your Account

        UForm(ref="loginFormRef" class="space-y-4" :schema="loginSchema" @submit.prevent="handleSubmit" :state="formState" @error="onFormError($event)" :disabled="isSaving")
        template(v-if="tokenChallengeRequired")
          UFormField(label="Code" for="tokenChallenge")
            UInput(
              id="tokenChallenge"
              v-model="formState.tokenChallenge"
              type="text"
              placeholder="Enter your two-factor authentication code"
              class="w-full"
            )
        template(v-else="")
          UFormField(label="Email Address" for="email")
            UInput(
              id="email"
              v-model="formState.email"
              type="text"
              placeholder="Enter your email"
              class="w-full"
            )
          UFormField(label="Password" for="password")
            UInput(
              id="password"
              v-model="formState.password"
              type="password"
              placeholder="Enter your password"
              class="w-full"
            )
        UButton(
          color="primary"
          size="lg"
          type="button"
          :disabled="isSaving"
          :loading="isSaving"
          @click="onLoginClick"
        ) Login

        template(#footer)
          div(class="text-sm text-center")
            ul
              li
                NuxtLink(to="/signup" class="text-primary-500 hover:underline")  Register
              li
                NuxtLink(to="/forgot-password" class="text-primary-500 hover:underline")  Forgot Password
      template(#fallback)
        UCard(class="w-full max-w-md p-6 rounded-lg shadow-md")
          template(#header)
            h2(class="text-xl font-bold text-center") Login to Your Account
          div(class="flex justify-center py-8")
            UIcon(name="i-lucide-loader-2" class="animate-spin size-8 text-primary")
</template>
