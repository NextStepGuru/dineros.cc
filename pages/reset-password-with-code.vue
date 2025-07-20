<script setup lang="ts">
import type { z } from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { handleError } from "~/lib/utils";
import { passwordAndCodeSchema } from "~/schema/zod";
const toast = useToast(); // Initialize the toast composable

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
  section(class="flex items-center justify-center min-h-screen")
    UCard(class="w-full max-w-md p-6 rounded-lg shadow-md")
      template(#header)
        h2(class="text-xl font-bold text-center") Forgot Password

      UForm(:state="formState" :schema="passwordAndCodeSchema" class="space-y-4" @submit.prevent="handleSubmit" @error="handleError($event, toast)" :disabled="isSaving")
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
            placeholder="Enter new your password"
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
          block) Reset Password

      template(#footer)
        div(class="text-sm text-center")
          ul
            li
              NuxtLink(to="/account-signup" class="text-primary-500 hover:underline")  Register
            li
              NuxtLink(to="/login" class="text-primary-500 hover:underline")  Login
</template>
