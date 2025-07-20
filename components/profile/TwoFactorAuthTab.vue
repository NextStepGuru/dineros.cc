<script setup lang="ts">
import type { User } from "../../types/types";

const toast = useToast();
const authStore = useAuthStore();

const isTwoFaSaving = ref(false);
const twoFaImage = ref("");
const twoFactorCode = ref("");
const showQRCode = ref(false);
const backupCodes = ref<string[]>([]);
const showBackupCodes = ref(false);

async function twoFactorAuth() {
  isTwoFaSaving.value = true;
  const { data: res, error } = await useAPI<{
    dataUri: string;
    backupCodes: string[];
  }>("/api/two-factor-auth");

  if (res?.value && res.value.dataUri && !error?.value) {
    twoFaImage.value = res.value.dataUri;
    backupCodes.value = res.value.backupCodes || [];
    showQRCode.value = true;
    toast.add({
      color: "green",
      description:
        "QR code generated. Please scan it with your authenticator app and enter the code below.",
    });
  } else if (error?.value) {
    toast.add({
      color: "error",
      description:
        error.value.message ||
        "Failed to generate two-factor authentication setup.",
    });
  }

  isTwoFaSaving.value = false;
}

async function verifyTwoFa() {
  if (!twoFactorCode.value.trim()) {
    toast.add({
      color: "error",
      description: "Please enter your two-factor authentication code.",
    });
    return;
  }

  isTwoFaSaving.value = true;
  const { data: res, error } = await useAPI<User>(
    "/api/verify-two-factor-auth",
    {
      method: "POST",
      body: { token: twoFactorCode.value.trim() },
    }
  );

  if (res?.value && !error?.value) {
    authStore.setUser(res.value);
    twoFactorCode.value = "";
    showQRCode.value = false;
    twoFaImage.value = "";
    backupCodes.value = [];
    showBackupCodes.value = false;
    toast.add({
      color: "green",
      description: "Two-factor authentication has been successfully enabled!",
    });
  } else if (error?.value) {
    toast.add({
      color: "error",
      description:
        error.value.message ||
        "Invalid two-factor authentication code. Please try again.",
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
    toast.add({
      color: "green",
      description: "Two-factor authentication has been successfully disabled.",
    });
  } else if (error?.value) {
    toast.add({
      color: "error",
      description:
        error.value.message || "Failed to disable two-factor authentication.",
    });
  }
  isTwoFaSaving.value = false;
}

function resetSetup() {
  showQRCode.value = false;
  twoFaImage.value = "";
  twoFactorCode.value = "";
  backupCodes.value = [];
  showBackupCodes.value = false;
}

function toggleBackupCodes() {
  showBackupCodes.value = !showBackupCodes.value;
}
</script>

<template lang="pug">
div(class="max-w-md min-h-96 my-4 m-auto")
  h2(class="text-xl font-bold text-center mb-6") Two Factor Authentication

  .pt-5(v-if="!authStore.has2faEnabled")
    UForm(:disabled="isTwoFaSaving" :loading="isTwoFaSaving")
      template(v-if="showQRCode")
        .text-center.mb-4
          img(:src="twoFaImage" class="mx-auto mb-4 max-w-64")
          p.text-sm.text-gray-600.mb-4 Scan this QR code with your authenticator app (like Google Authenticator, Authy, or 1Password)

        // Backup Codes Section
        .mb-4.p-4.bg-yellow-50.border.border-yellow-200.rounded-lg
          h3.text-sm.font-medium.text-yellow-800.mb-2 Emergency Backup Codes
          p.text-xs.text-yellow-700.mb-3 Save these backup codes in a secure location. You can use them to access your account if you lose your authenticator device.

          .flex.items-center.justify-between.mb-2
            UButton(
              color="yellow"
              size="sm"
              @click="toggleBackupCodes"
              class="text-xs"
            ) {{ showBackupCodes ? 'Hide' : 'Show' }} Backup Codes

          template(v-if="showBackupCodes")
            .grid.grid-cols-2.gap-2.mb-3
              .text-center.p-2.bg-white.border.rounded.font-mono.text-sm(v-for="code in backupCodes" :key="code") {{ code }}
            p.text-xs.text-yellow-700.text-center ⚠️ Each code can only be used once

        UFormField(label="Authentication Code" for="twoFactorCode")
          UInput(
            v-model="twoFactorCode"
            type="text"
            placeholder="Enter 6-digit code from your authenticator app"
            class="w-full"
            maxlength="6"
            pattern="[0-9]{6}"
            autocomplete="one-time-code"
          )

        .flex.gap-2.mt-4
          UButton(
            color="primary"
            size="lg"
            :disabled="isTwoFaSaving || !twoFactorCode.value.trim()"
            :loading="isTwoFaSaving"
            @click="verifyTwoFa"
            class="flex-1"
          ) Verify Code
          UButton(
            color="gray"
            size="lg"
            :disabled="isTwoFaSaving"
            @click="resetSetup"
            class="flex-1"
          ) Start Over

      UButton(
        v-else=""
        color="primary"
        class="mt-4 w-full"
        size="lg"
        @click="twoFactorAuth()"
        :disabled="isTwoFaSaving"
        :loading="isTwoFaSaving"
      ) Enable Two-Factor Authentication

  .pt-5(v-else="")
    .text-center.mb-4
      p.text-green-600.font-medium ✓ Two-factor authentication is enabled
      p.text-sm.text-gray-600 Your account is protected with an additional layer of security

    UButton(
      color="error"
      size="lg"
      class="w-full"
      @click="disable2fa"
      :disabled="isTwoFaSaving"
      :loading="isTwoFaSaving"
    ) Disable Two-Factor Authentication
</template>
