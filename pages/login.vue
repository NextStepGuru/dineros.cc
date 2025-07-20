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

// Submit handler - now using testable utilities
const handleSubmit = async ({
  data: formData,
}: FormSubmitEvent<LoginSchemaType>) => {
  try {
    isSaving.value = true;
    const { data, error } = await useAPI<{
      token: string;
      user?: User | null | undefined;
      message?: null;
      errors?: { message: string }[];
    }>(() => "/api/login", {
      method: "POST",
      body: formData,
    });

    if (error.value) {
      isSaving.value = false;
      toast.add({
        color: "error",
        description: formatLoginError(error.value),
      });
      return;
    }

    // Use our testable login response processor
    const result = processLoginResponse(data?.value as LoginResponse);

    if (result.success && result.token) {
      // Store the token in a cookie
      authTokenCookie.value = result.token;
      authStore.setToken(result.token);

      if (result.user) {
        authStore.setUser(result.user);
      }

      // Show success message
      toast.add({ color: "success", description: "Login successful!" });

      // Fetch lists and redirect using testable logic
      await listStore.fetchLists();
      authStore.setBudgetId(listStore.getBudgets[0].id);

      const redirectPath = getPostLoginRedirect(listStore.getAccountRegisters);
      navigateTo(redirectPath);

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
    UCard(class="w-full max-w-md p-6 rounded-lg shadow-md")
      template(#header)
        h2(class="text-xl font-bold text-center") Login to Your Account

      UForm(class="space-y-4" :schema="loginSchema" @submit.prevent="handleSubmit" :state="formState" @error="handleError($event, toast)" :disabled="isSaving")
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
          type="submit"
          :disabled="isSaving"
          :loading="isSaving"
        ) Login

      template(#footer)
        div(class="text-sm text-center")
          ul
            li
              NuxtLink(to="/signup" class="text-primary-500 hover:underline")  Register
            li
              NuxtLink(to="/forgot-password" class="text-primary-500 hover:underline")  Forgot Password
</template>
