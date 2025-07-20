<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { handleError } from "~/lib/utils";
const toast = useToast(); // Initialize the toast composable

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
  section(class="flex items-center justify-center min-h-screen")
    UCard(class="w-full max-w-md p-6 rounded-lg shadow-md")
      template(#header)
        h2(class="text-xl font-bold text-center") Forgot Password

      UForm(:state="formState" :schema="forgotPasswordSchema" class="space-y-4" @submit.prevent="handleSubmit" @error="handleError($event, toast)" :disabled="isSaving")
        UFormField(label="Email Address" for="email")
          UInput(
            id="email"
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
        ) Forgot Password

      template(#footer)
        div(class="text-sm text-center")
          ul
            li
              NuxtLink(to="/signup" class="text-primary-500 hover:underline")  Register
            li
              NuxtLink(to="/login" class="text-primary-500 hover:underline")  Login
</template>
