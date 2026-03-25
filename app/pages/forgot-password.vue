<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { handleError } from "~/lib/utils";
const toast = useToast(); // Initialize the toast composable
const runtimeConfig = useRuntimeConfig();
const siteUrl = runtimeConfig.public.siteUrl || "https://dineros.cc";
const canonicalUrl = `${siteUrl}/forgot-password`;
const socialImageUrl =
  "https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_128/v1737776329/pepe_solo_t0twqk.png";

useServerSeoMeta({
  title: "Forgot Password | Dineros",
  description:
    "Request a secure password reset code to regain access to your Dineros account, restore sign-in access quickly, and continue managing predictive budgets with confidence.",
  robots: "noindex, follow",
  ogTitle: "Forgot Password | Dineros",
  ogDescription:
    "Request a secure password reset code to regain access to your Dineros account, restore sign-in access quickly, and continue managing predictive budgets with confidence.",
  ogType: "website",
  ogUrl: canonicalUrl,
  ogImage: socialImageUrl,
  twitterCard: "summary",
  twitterTitle: "Forgot Password | Dineros",
  twitterDescription:
    "Request a secure password reset code to regain access to your Dineros account, restore sign-in access quickly, and continue managing predictive budgets with confidence.",
  twitterImage: socialImageUrl,
});

useHead({
  link: [{ rel: "canonical", href: canonicalUrl }],
});

// Zod schema for form validation
const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type ForgotPasswordSchemaType = z.infer<typeof forgotPasswordSchema>;
// Form state
const formState = ref({
  email: "",
});

const isSaving = ref(false);

function onFormError(event: Parameters<typeof handleError>[0]) {
  handleError(event, toast);
}

// Submit handler
const handleSubmit = async ({
  data: formData,
}: FormSubmitEvent<ForgotPasswordSchemaType>) => {
  try {
    isSaving.value = true;
    const { error } = await useAPI<{ message: string }>(
      "/api/forgot-password",
      {
        method: "POST",
        body: formData,
      }
    );

    if (error.value) {
      isSaving.value = false;
      toast.add({
        color: "error",
        description:
          error.value.data.errors ||
          error.value?.message ||
          "Forgot Password failed.",
      });
      return;
    }

    toast.add({
      color: "success",
      description: "Forgot Password successful, please login.",
    });
    navigateTo("/reset-password-with-code");
  } catch (error: unknown) {
    isSaving.value = false;
    handleError(
      error instanceof Error ? error : new Error(String(error)),
      toast,
    );
  }
};
</script>

<template lang="pug">
  section(class="auth-page flex items-center justify-center")
    AuthFormCard(
      icon="i-lucide-key-round"
      title="Recover your account"
      subtitle="Enter your email and we will send a secure reset code."
    )
      UForm(:state="formState" :schema="forgotPasswordSchema" class="auth-form" @submit.prevent="handleSubmit" @error="onFormError" :disabled="isSaving")
        UFormField(label="Email Address" for="email")
          UInput(
            id="email"
            name="email"
            aria-label="Email address"
            v-model="formState.email"
            type="text"
            placeholder="Enter your email"
            class="w-full"
          )
        UButton(
          color="primary"
          size="lg"
          type="submit"
          :disabled="isSaving"
          :loading="isSaving"
        ) Send reset code

      template(#footer)
        div(class="text-sm text-center")
          ul
            li
              ULink(to="/signup" class="frog-link hover:underline")  Need an account? Create one
            li
              ULink(to="/login" class="frog-link hover:underline")  Back to sign in
</template>
