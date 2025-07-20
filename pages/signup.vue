<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { handleError } from "~/lib/utils";
const toast = useToast(); // Initialize the toast composable

// Zod schema for form validation
const signupSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters long"),
    confirmPassword: z
      .string()
      .min(6, "Confirm password must be at least 6 characters long"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
const isSaving = ref(false);
type RegisterSchemaType = z.infer<typeof signupSchema>;
// Form state
const formState = ref({
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  confirmPassword: "",
});

// Submit handler
const handleSubmit = async ({
  data: formData,
}: FormSubmitEvent<RegisterSchemaType>) => {
  try {
    isSaving.value = true;
    const { error } = await useAPI<{ token: string }>("/api/account-signup", {
      method: "POST",
      body: Object.fromEntries(Object.entries(formData).filter(([key]) => [
        "firstName",
        "lastName",
        "email",
        "password",
        "confirmPassword",
      ].includes(key))),
    });

    if (error.value) {
      isSaving.value = false;
      toast.add({
        color: "error",
        description:
          error.value.data.errors ||
          error.value?.message ||
          "Registration failed.",
      });
      return;
    }

    toast.add({
      color: "success",
      description: "Registration successful, please login.",
    });
    await navigateTo("/login");
  } catch (error) {
    isSaving.value = false;
    toast.add({
      color: "error",
      description: "An error occurred during registration.",
    });
  }
};
</script>

<template lang="pug">
  section(class="flex items-center justify-center min-h-screen")
    UCard(class="w-full max-w-md p-6 rounded-lg shadow-md")
      template(#header)
        h2(class="text-xl font-bold text-center") Register an Account

      UForm(:state="formState" :schema="signupSchema" class="space-y-4" @submit.prevent="handleSubmit" @error="handleError($event, toast)" :disabled="isSaving")
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
        UFormField(label="Confirm Password" for="confirmPassword")
          UInput(
            id="confirmPassword"
            v-model="formState.confirmPassword"
            type="password"
            placeholder="Confirm your password"
            class="w-full"
          )
        UButton(
          color="primary"
          size="lg"
          type="submit"
          :disabled="isSaving"
          :loading="isSaving"
        ) Register

      template(#footer)
        div(class="text-sm text-center")
          ul
            li
              NuxtLink(to="/login" class="text-primary-500 hover:underline")  Login
            li
              NuxtLink(to="/forgot-password" class="text-primary-500 hover:underline")  Forgot Password
</template>
