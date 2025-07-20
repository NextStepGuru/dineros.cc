<script setup lang="ts">
import type { User } from "../../types/types";

const toast = useToast();
const authStore = useAuthStore();

const isTwoFaSaving = ref(false);
const twoFaImage = ref("");
const twoFactorCode = ref("");

async function twoFactorAuth() {
  isTwoFaSaving.value = true;
  const { data: res, error } = await useAPI<{
    dataUri: string;
  }>("/api/two-factor-auth");

  if (res?.value && res.value.dataUri && !error?.value) {
    twoFaImage.value = res.value.dataUri;
  } else if (error?.value) {
    toast.add({
      color: "error",
      description: error.value.message || "Two-Factor Authentication failed.",
    });
  }

  isTwoFaSaving.value = false;
}

async function verifyTwoFa() {
  isTwoFaSaving.value = true;
  const { data: res, error } = await useAPI<User>(
    "/api/verify-two-factor-auth",
    {
      method: "POST",
      body: { token: twoFactorCode.value },
    }
  );

  if (res?.value && !error?.value) {
    authStore.setUser(res.value);
  } else if (error?.value) {
    toast.add({
      color: "error",
      description: error.value.message || "Two-Factor Authentication failed.",
    });
  }

  isTwoFaSaving.value = false;
}

async function disable2fa() {
  isTwoFaSaving.value = true;
  const { data: res, error } = await useAPI<User>(
    "/api/disable-two-factor-auth",
    {
      method: "POST",
    }
  );

  if (res?.value && !error?.value) {
    authStore.setUser(res.value);
  } else if (error?.value) {
    toast.add({
      color: "error",
      description:
        error.value.message || "Two-Factor Authentication disabling failed.",
    });
  }
  isTwoFaSaving.value = false;
}
</script>

<template lang="pug">
div(class="max-w-md min-h-96 my-4 m-auto")
  h2(class="text-xl font-bold text-center") Two Factor Authentication

  .pt-5(v-if="!authStore.has2faEnabled")
    UForm(:disabled="isTwoFaSaving" :loading="isTwoFaSaving")
      template(v-if="twoFaImage")
        img(:src="twoFaImage" class="mb-4")
        UFormField(label="Code" for="twoFactorCode")
          UInput(v-model="twoFactorCode" type="text" placeholder="Enter your two-factor authentication code" class="w-full")

        UButton(color="primary" class="mt-4" size="lg" :disabled="isTwoFaSaving" :loading="isTwoFaSaving" @click="verifyTwoFa") Verify
      UButton(v-else="" color="primary" class="mt-4" size="lg" @click="twoFactorAuth()" :disabled="isTwoFaSaving" :loading="isTwoFaSaving") Enable Two-Factor Authentication
  .pt-5(v-else="")
    UButton(color="error" size="lg" @click="disable2fa") Disable Two-Factor Authentication
</template>
