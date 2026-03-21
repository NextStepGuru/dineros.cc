<script setup lang="ts">
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/types";
import type { z } from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { startAuthentication } from "@simplewebauthn/browser";
import { handleError } from "~/lib/utils";
import type { loginSchema } from "~/schema/zod";
import type { User } from "~/types/types";
import type { LoginResponse } from "~/lib/auth";
import {
  processLoginResponse,
  formatLoginError,
  getPostLoginRedirect,
} from "~/lib/auth";

const authStore = useAuthStore();
const listStore = useListStore();
const toast = useToast();
const route = useRoute();
const runtimeConfig = useRuntimeConfig();
const siteUrl = runtimeConfig.public.siteUrl || "https://dineros.cc";
const canonicalUrl = `${siteUrl}/login`;
const socialImageUrl =
  "https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_128/v1737776329/pepe_solo_t0twqk.png";

useServerSeoMeta({
  title: "Sign In to Dineros | Predictive Budgeting Access",
  description:
    "Sign in to Dineros to access your predictive budgets, recurring transaction automation, secure account registers, and forward-looking balance forecasts.",
  robots: "noindex, follow",
  ogTitle: "Sign In to Dineros | Predictive Budgeting Access",
  ogDescription:
    "Sign in to Dineros to access your predictive budgets, recurring transaction automation, secure account registers, and forward-looking balance forecasts.",
  ogType: "website",
  ogUrl: canonicalUrl,
  ogImage: socialImageUrl,
  twitterCard: "summary",
  twitterTitle: "Sign In to Dineros | Predictive Budgeting Access",
  twitterDescription:
    "Sign in to Dineros to access your predictive budgets, recurring transaction automation, secure account registers, and forward-looking balance forecasts.",
  twitterImage: socialImageUrl,
});

useHead({
  link: [{ rel: "canonical", href: canonicalUrl }],
});

type LoginSchemaType = z.infer<typeof loginSchema>;

const formState = ref<Partial<LoginSchemaType>>({ email: "", password: "" });

const isSaving = ref(false);
const tokenChallengeRequired = ref(false);
const mfaMethods = ref<Array<"totp" | "passkey" | "email">>([]);
const selectedMfaMethod = ref<"totp" | "passkey" | "email">("totp");
const emailCodeSent = ref(false);

watch(selectedMfaMethod, (method) => {
  formState.value.tokenChallenge = "";
  if (method !== "email") {
    emailCodeSent.value = false;
  }
});

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
  const last = readLocalLastSignupCredentials();
  if (last && !String(formState.value.email ?? "").trim()) {
    formState.value.email = last.email;
    formState.value.password = last.password;
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

    const completeAuth = async (response: LoginResponse) => {
      const result = processLoginResponse(response);
      if (result.success && result.token) {
        authTokenCookie.value = result.token;
        authStore.setToken(result.token);
        if (result.user) {
          authStore.setUser(result.user as User);
        }

        await listStore.fetchLists();
        const defaultBudget = listStore.getDefaultBudget;
        if (defaultBudget) authStore.setBudgetId(defaultBudget.id);
        const redirectPath = getPostLoginRedirect(
          listStore.getAccountRegisters,
        );
        toast.add({ color: "success", description: "Login successful!" });
        window.location.assign(redirectPath);
        return true;
      }
      return false;
    };

    if (!tokenChallengeRequired.value) {
      let data: LoginResponse | null = null;
      const err: { value?: { statusCode?: number; data?: unknown } } = {
        value: undefined,
      };
      try {
        data = await $api<LoginResponse>("/api/login", {
          method: "POST",
          body: formData,
        });
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

      const processed = processLoginResponse(data as LoginResponse);
      if (processed.requiresTwoFactor) {
        tokenChallengeRequired.value = true;
        mfaMethods.value = processed.mfaMethods?.length
          ? processed.mfaMethods
          : ["totp"];
        selectedMfaMethod.value = mfaMethods.value.includes("totp")
          ? "totp"
          : mfaMethods.value[0];
        emailCodeSent.value = false;
        isSaving.value = false;
        return;
      }

      const completed = await completeAuth(data as LoginResponse);
      if (!completed) {
        toast.add({
          color: "error",
          description: processed.errorMessage || "Invalid login credentials.",
        });
      }
      isSaving.value = false;
      return;
    }

    if (selectedMfaMethod.value === "totp") {
      if (!String(formState.value.tokenChallenge || "").trim()) {
        toast.add({
          color: "error",
          description: "Enter your authentication code.",
        });
        isSaving.value = false;
        return;
      }

      const data = await $fetch<LoginResponse>("/api/mfa/totp/verify", {
        method: "POST",
        body: { token: String(formState.value.tokenChallenge || "").trim() },
      });
      await completeAuth(data);
      isSaving.value = false;
      return;
    }

    if (selectedMfaMethod.value === "email") {
      const code = String(formState.value.tokenChallenge || "").trim();
      if (!emailCodeSent.value) {
        await $api("/api/mfa/email/send-code", { method: "POST" });
        emailCodeSent.value = true;
        toast.add({
          color: "success",
          description: "Verification code sent to your email.",
        });
        isSaving.value = false;
        return;
      }

      if (!code) {
        toast.add({
          color: "error",
          description: "Enter the email verification code.",
        });
        isSaving.value = false;
        return;
      }

      const data = await $fetch<LoginResponse>("/api/mfa/email/verify", {
        method: "POST",
        body: { code },
      });
      await completeAuth(data);
      isSaving.value = false;
      return;
    }
  } catch (error) {
    isSaving.value = false;
    toast.add({
      color: "error",
      description: "An error occurred during login.",
    });
  }
};

async function startPasskeySignIn() {
  try {
    isSaving.value = true;
    const optionsJSON = await $fetch<PublicKeyCredentialRequestOptionsJSON>(
      "/api/mfa/passkey/auth-options" as any,
      {
        method: "POST",
      },
    );
    const assertion = await startAuthentication({ optionsJSON });
    const data = await $fetch<LoginResponse>("/api/mfa/passkey/verify", {
      method: "POST",
      body: { response: assertion },
    });
    const result = processLoginResponse(data);
    if (result.success && result.token) {
      authTokenCookie.value = result.token;
      authStore.setToken(result.token);
      if (result.user) {
        authStore.setUser(result.user as User);
      }
      await listStore.fetchLists();
      if (listStore.getBudgets.length > 0) {
        authStore.setBudgetId(listStore.getBudgets[0].id);
      }
      const redirectPath = getPostLoginRedirect(listStore.getAccountRegisters);
      toast.add({ color: "success", description: "Login successful!" });
      window.location.assign(redirectPath);
      return;
    }
    toast.add({
      color: "error",
      description: result.errorMessage || "Passkey verification failed.",
    });
  } catch (_error) {
    toast.add({
      color: "error",
      description: "Unable to complete passkey sign-in.",
    });
  } finally {
    isSaving.value = false;
  }
}
</script>

<template lang="pug">
  section(class="auth-page flex items-center justify-center")
    ClientOnly
      AuthFormCard(
        icon="i-lucide-log-in"
        title="Welcome back"
        subtitle="Sign in to continue forecasting, tracking, and planning with confidence."
      )
        UForm(class="auth-form" :schema="loginSchema" @submit.prevent="handleSubmit" :state="formState" @error="onFormError($event)" :disabled="isSaving")
          UFormField(v-if="tokenChallengeRequired" label="Verification method" for="mfaMethod")
            select(
              id="mfaMethod"
              v-model="selectedMfaMethod"
              class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            )
              option(v-for="method in mfaMethods" :key="method" :value="method")
                | {{ method === 'totp' ? 'Authenticator app' : method === 'passkey' ? 'Security key / passkey' : 'Email code' }}

          UFormField(v-if="tokenChallengeRequired" label="Code" for="tokenChallenge")
            UInput(
              id="tokenChallenge"
              v-model="formState.tokenChallenge"
              type="text"
              :placeholder="selectedMfaMethod === 'email' ? 'Enter the code from your email' : 'Enter your two-factor authentication code'"
              class="w-full"
              :disabled="selectedMfaMethod === 'passkey'"
            )
          UButton(
            v-if="tokenChallengeRequired && selectedMfaMethod === 'passkey'"
            color="neutral"
            size="lg"
            type="button"
            :disabled="isSaving"
            :loading="isSaving"
            @click="startPasskeySignIn"
          ) Use security key / passkey
          UFormField(v-if="!tokenChallengeRequired" label="Email Address" for="email")
            UInput(
              id="email"
              v-model="formState.email"
              type="text"
              placeholder="Enter your email"
              class="w-full"
            )
          UFormField(v-if="!tokenChallengeRequired" label="Password" for="password")
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
            :disabled="isSaving || (tokenChallengeRequired && selectedMfaMethod === 'passkey')"
            :loading="isSaving"
          ) {{ tokenChallengeRequired && selectedMfaMethod === 'email' && !emailCodeSent ? 'Send email code' : 'Sign in' }}

        template(#footer)
          div(class="text-sm text-center")
            ul
              li
                ULink(to="/signup" class="frog-link hover:underline")  New to Dineros? Create account
              li
                ULink(to="/forgot-password" class="frog-link hover:underline")  Forgot password?
      template(#fallback)
        AuthFormCard(icon="i-lucide-log-in" title="Welcome back" :subtitle="null")
          div(class="flex justify-center py-8")
            UIcon(name="i-lucide-loader-2" class="animate-spin size-8 text-primary")
</template>
