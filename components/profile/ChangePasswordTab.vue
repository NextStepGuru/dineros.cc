<script setup lang="ts">
import { handleError } from "~/lib/utils";
import type { FormSubmitEvent } from "@nuxt/ui";
import type { z } from "zod";
import type { User } from "../../types/types";

import { passwordSchema } from "~/schema/zod";

type PasswordSchemaType = z.infer<typeof passwordSchema>;

const toast = useToast();
const authStore = useAuthStore();

const passwordState = ref<
  Partial<{
    newPassword: string;
    confirmPassword: string;
  }>
>({});
const isPasswordChanging = ref(false);

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
      isPasswordChanging.value = false;
      toast.add({
        color: "error",
        description: error.value.message || "Password update failed.",
      });
      return;
    }

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

// Expose handleError to template
const handleErrorForTemplate = handleError;
</script>

<template lang="pug">
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
