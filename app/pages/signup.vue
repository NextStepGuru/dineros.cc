<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { handleError } from "~/lib/utils";
const toast = useToast(); // Initialize the toast composable
const runtimeConfig = useRuntimeConfig();
const siteUrl = runtimeConfig.public.siteUrl || "https://dineros.cc";

function signupPrefillAllowed(): boolean {
  if (import.meta.dev) return true;
  if (runtimeConfig.public.signupTestPrefill) return true;
  let host = "";
  if (import.meta.server) {
    host = useRequestURL().hostname;
  } else if (globalThis.location !== undefined) {
    host = globalThis.location.hostname;
  }
  if (/^(localhost|127\.0\.0\.1)$/i.test(host)) return true;
  if (/(?:staging|(?:^|\.)test\.|\.vercel\.app$)/i.test(host)) return true;
  return false;
}

const TEST_FIRST = [
  "James",
  "Maria",
  "Chen",
  "Priya",
  "Diego",
  "Emma",
  "Kwame",
  "Sofia",
  "Oliver",
  "Yuki",
] as const;
const TEST_LAST = [
  "Martinez",
  "Okonkwo",
  "Nakamura",
  "Patel",
  "Andersen",
  "Silva",
  "Kim",
  "Okafor",
  "Reyes",
  "Fischer",
] as const;

function randomUint32(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]!;
}

function pick<T extends readonly string[]>(arr: T): T[number] {
  return arr[randomUint32() % arr.length]!;
}

function secureRandomId8(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) {
    return c.randomUUID().replaceAll("-", "").slice(0, 8);
  }
  if (c?.getRandomValues) {
    const bytes = new Uint8Array(8);
    c.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Date.now().toString(36)}`.slice(0, 16);
}

function randomSignupFixture() {
  const id = secureRandomId8();
  const pass = `Test!${id}Aa1`;
  return {
    firstName: pick(TEST_FIRST),
    lastName: pick(TEST_LAST),
    email: `e2e.${id}@mailinator.com`,
    password: pass,
    confirmPassword: pass,
  };
}

const signupPrefill = useState<ReturnType<typeof randomSignupFixture> | null>(
  "signup-test-prefill",
  () => (signupPrefillAllowed() ? randomSignupFixture() : null),
);
const canonicalUrl = `${siteUrl}/signup`;
const socialImageUrl =
  "https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_128/v1737776329/pepe_solo_t0twqk.png";

useServerSeoMeta({
  title: "Create Your Dineros Account | Predictive Budgeting",
  description:
    "Create a Dineros account to start predictive budgeting, automate recurring transaction tracking, and forecast account balances.",
  robots: "noindex, follow",
  ogTitle: "Create Your Dineros Account | Predictive Budgeting",
  ogDescription:
    "Create a Dineros account to start predictive budgeting, automate recurring transaction tracking, and forecast account balances.",
  ogType: "website",
  ogUrl: canonicalUrl,
  ogImage: socialImageUrl,
  twitterCard: "summary",
  twitterTitle: "Create Your Dineros Account | Predictive Budgeting",
  twitterDescription:
    "Create a Dineros account to start predictive budgeting, automate recurring transaction tracking, and forecast account balances.",
  twitterImage: socialImageUrl,
});

useHead({
  link: [{ rel: "canonical", href: canonicalUrl }],
});

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

function onFormError(event: Parameters<typeof handleError>[0]) {
  handleError(event, toast);
}

type RegisterSchemaType = z.infer<typeof signupSchema>;
const formState = ref({
  firstName: signupPrefill.value?.firstName ?? "",
  lastName: signupPrefill.value?.lastName ?? "",
  email: signupPrefill.value?.email ?? "",
  password: signupPrefill.value?.password ?? "",
  confirmPassword: signupPrefill.value?.confirmPassword ?? "",
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
      const msg =
        error.value.data?.errors ??
        error.value.data?.message ??
        error.value?.message ??
        "Registration failed.";
      toast.add({
        color: "error",
        description: typeof msg === "string" ? msg : String(msg),
      });
      return;
    }

    toast.add({
      color: "success",
      description: "Registration successful, please login.",
    });
    saveLocalLastSignupCredentials(formData.email, formData.password);
    await navigateTo("/login");
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
      icon="i-lucide-user-plus"
      title="Create your account"
      subtitle="Build your first predictive budget in minutes."
    )
      UForm(:state="formState" :schema="signupSchema" class="auth-form" @submit.prevent="handleSubmit" @error="onFormError" :disabled="isSaving")
        UFormField(label="First Name" for="firstName")
          UInput(
            id="firstName"
            name="firstName"
            aria-label="First name"
            v-model="formState.firstName"
            type="text"
            placeholder="Enter your first name"
            class="w-full"
          )
        UFormField(label="Last Name" for="lastName")
          UInput(
            id="lastName"
            name="lastName"
            aria-label="Last name"
            v-model="formState.lastName"
            type="text"
            placeholder="Enter your last name"
            class="w-full"
          )
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
        UFormField(label="Password" for="password")
          UInput(
            id="password"
            name="password"
            aria-label="Password"
            v-model="formState.password"
            type="password"
            placeholder="Enter your password"
            class="w-full"
          )
        UFormField(label="Confirm Password" for="confirmPassword")
          UInput(
            id="confirmPassword"
            name="confirmPassword"
            aria-label="Confirm password"
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
        ) Create account

      template(#footer)
        div(class="text-sm text-center")
          ul
            li
              ULink(to="/login" class="frog-link hover:underline")  Already have an account? Sign in
            li
              ULink(to="/forgot-password" class="frog-link hover:underline")  Need help accessing your account?
</template>
