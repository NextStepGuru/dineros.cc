<script setup lang="ts">
import { handleError } from "~/lib/utils";
import type { FormSubmitEvent } from "@nuxt/ui";
import type { z } from "zod";
import type { User } from "../../types/types";

import { changePasswordSchema } from "~/schema/zod";

/** Runtime schema for UForm `:schema` (value use; avoids type-only import lint). */
const passwordFormSchema = changePasswordSchema;

type PasswordSchemaType = z.infer<typeof changePasswordSchema>;

const toast = useToast();
const authStore = useAuthStore();

const passwordState = ref<
  Partial<{
    currentPassword: string;
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
    const { error } = await useAPI<User>("/api/change-password", {
      method: "POST",
      body: passwordState,
    });

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
UCard(class="max-w-md mx-auto")
  UForm(class="space-y-4" @submit.prevent="handlePasswordSubmit" :state="passwordState" :schema="passwordFormSchema" @error="handleError($event, toast)" :disabled="isPasswordChanging")
    UFormField(label="Current password" for="currentPassword")
      UInput(
        id="currentPassword"
        v-model="passwordState.currentPassword"
        type="password"
        placeholder="Enter your current password"
        aria-label="Current password"
        autocomplete="current-password"
        class="w-full"
      )
    UFormField(label="New password" for="newPassword")
      UInput(
        id="newPassword"
        v-model="passwordState.newPassword"
        type="password"
        placeholder="Enter new your password"
        aria-label="New password"
        autocomplete="new-password"
        class="w-full"
      )
    UFormField(label="Confirm Password" for="confirmPassword")
      UInput(
        id="confirmPassword"
        v-model="passwordState.confirmPassword"
        type="password"
        placeholder="Confirm your new password"
        aria-label="Confirm new password"
        autocomplete="new-password"
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
