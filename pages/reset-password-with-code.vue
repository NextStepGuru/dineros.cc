<script setup lang="ts">
import type { z } from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { handleError } from "~/lib/utils";
import { passwordAndCodeSchema } from "~/schema/zod";
const toast = useToast(); // Initialize the toast composable
const runtimeConfig = useRuntimeConfig();
const siteUrl = runtimeConfig.public.siteUrl || "https://dineros.cc";
const canonicalUrl = `${siteUrl}/reset-password-with-code`;
const socialImageUrl =
  "https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_128/v1737776329/pepe_solo_t0twqk.png";

useServerSeoMeta({
  title: "Reset Your Dineros Password | Secure Account Recovery",
  description:
    "Set a new password for your Dineros account using your secure reset code.",
  robots: "noindex, follow",
  ogTitle: "Reset Your Dineros Password | Secure Account Recovery",
  ogDescription:
    "Set a new password for your Dineros account using your secure reset code.",
  ogType: "website",
  ogUrl: canonicalUrl,
  ogImage: socialImageUrl,
  twitterCard: "summary",
  twitterTitle: "Reset Your Dineros Password | Secure Account Recovery",
  twitterDescription:
    "Set a new password for your Dineros account using your secure reset code.",
  twitterImage: socialImageUrl,
});

useHead({
  link: [{ rel: "canonical", href: canonicalUrl }],
});

type PasswordAndCodeSchemaType = z.infer<typeof passwordAndCodeSchema>;
// Form state
const formState = ref({
  resetCode: "",
  newPassword: "",
  confirmPassword: "",
});

const isSaving = ref(false);

// Submit handler
const handleSubmit = async ({
  data: formData,
}: FormSubmitEvent<PasswordAndCodeSchemaType>) => {
  try {
    isSaving.value = true;
    const { error } = await useAPI<{ message: string }>(
      "/api/reset-password-with-code",
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
    await navigateTo("/login");
  } catch (error) {
    isSaving.value = false;
    toast.add({
      color: "error",
      description: "An error occurred during Forgot Password.",
    });
  }
};
</script>

<template lang="pug">
  section(class="auth-page flex items-center justify-center")
    AuthFormCard(
      icon="i-lucide-rotate-ccw"
      title="Set a new password"
      subtitle="Confirm your reset code and choose a secure password."
    )
      UForm(:state="formState" :schema="passwordAndCodeSchema" class="auth-form" @submit.prevent="handleSubmit" @error="handleError($event, toast)" :disabled="isSaving")
        UFormField(label="Reset Code" for="resetCode" hint="Check email for reset code")
          UInput(
            id="resetCode"
            v-model="formState.resetCode"
            type="text"
            placeholder="Enter the reset code"
            class="w-full")
        UFormField(label="Password" for="newPassword")
          UInput(
            id="newPassword"
            v-model="formState.newPassword"
            type="password"
            placeholder="Enter your new password"
            class="w-full")
        UFormField(label="Confirm Password" for="confirmPassword")
          UInput(
            id="confirmPassword"
            v-model="formState.confirmPassword"
            type="password"
            placeholder="Confirm your new password"
            class="w-full")
        UButton(
          color="primary"
          size="lg"
          type="submit"
          :disabled="isSaving"
          :loading="isSaving"
          block) Update password

      template(#footer)
        div(class="text-sm text-center")
          ul
            li
              ULink(to="/signup" class="frog-link hover:underline")  Need an account? Create one
            li
              ULink(to="/login" class="frog-link hover:underline")  Back to sign in
</template>
