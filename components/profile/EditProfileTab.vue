<script setup lang="ts">
import { handleError } from "~/lib/utils";
import type { FormSubmitEvent } from "@nuxt/ui";
import type { z } from "zod";
import type { User } from "../../types/types";

import { publicProfileSchema } from "~/schema/zod";

type ProfileSchemaType = z.infer<typeof publicProfileSchema>;

const toast = useToast();
const authStore = useAuthStore();

const formState = ref<Partial<User>>(authStore.getUser || {});
const isProfileSaving = ref(false);

// Submit handler
const handleSubmit = async ({
  data: formData,
}: FormSubmitEvent<ProfileSchemaType>) => {
  try {
    isProfileSaving.value = true;
    const { data: responseData, error } = await useAPI<User>("/api/user", {
      method: "POST",
      body: formData,
    });

    if (error?.value) {
      isProfileSaving.value = false;
      toast.add({
        color: "error",
        description: error.value.message || "Profile update failed.",
      });
      return;
    }
    formState.value.firstName = responseData.value?.firstName || "";
    formState.value.lastName = responseData.value?.lastName || "";
    formState.value.email = responseData.value?.email || "";

    toast.add({
      color: "success",
      description: "Profile updated successfully.",
    });
    isProfileSaving.value = false;
  } catch (error) {
    isProfileSaving.value = false;
    toast.add({
      color: "error",
      description:
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : "An error occurred during profile update.",
    });
  }
};

// Expose handleError to template
const handleErrorForTemplate = handleError;
</script>

<template lang="pug">
div(class="max-w-md min-h-96 my-4 m-auto")
  h2(class="text-xl font-bold text-center") Edit Profile

  UForm(class="m-4 space-y-4" @submit.prevent="handleSubmit" :state="formState" :schema="publicProfileSchema" @error="handleError($event, toast)" :disabled="isProfileSaving")
    UFormField(label="First Name" for="firstName")
      UInput(
        id="firstName"
        v-model="formState.firstName"
        type="text"
        placeholder="Enter your first name"
        class="w-full"
      )
    UFormField(label="Last Name" for="lastName")
      UInput(
        id="lastName"
        v-model="formState.lastName"
        type="text"
        placeholder="Enter your last name"
        class="w-full"
      )
    UFormField(label="Email Address" for="email")
      UInput(
        id="email"
        v-model="formState.email"
        type="text"
        placeholder="Enter your email"
        required
        class="w-full"
      )
    UButton(
      color="primary"
      size="lg"
      type="submit"
      :disabled="isProfileSaving"
      :loading="isProfileSaving"
    ) Update Profile
</template>
