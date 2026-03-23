<script setup lang="ts">
import { startRegistration } from "@simplewebauthn/browser";
import type { User } from "../../types/types";

const toast = useToast();
const authStore = useAuthStore();
const $api = useNuxtApp().$api as typeof $fetch;

const isTwoFaSaving = ref(false);
const twoFaImage = ref("");
const showQRCode = ref(false);
const backupCodes = ref<string[]>([]);
const showBackupCodes = ref(false);
const twoFaFormState = reactive({
  twoFactorCode: "",
  passkeyName: "",
});

const mfaSettings = computed(() => authStore.user?.settings?.mfa);
const hasTotpEnabled = computed(
  () =>
    Boolean(mfaSettings.value?.totp?.isEnabled) &&
    Boolean(mfaSettings.value?.totp?.isVerified)
);
const passkeys = computed(() => mfaSettings.value?.passkeys || []);
const emailOtpEnabled = computed(() => Boolean(mfaSettings.value?.emailOtp?.isEnabled));
const hasAnyMfaEnabled = computed(
  () => hasTotpEnabled.value || passkeys.value.length > 0 || emailOtpEnabled.value
);

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    return String((error as { data?: { message?: string; errors?: string } }).data?.errors || (error as { data?: { message?: string } }).data?.message || "");
  }
  return "";
}

async function twoFactorAuth() {
  isTwoFaSaving.value = true;
  try {
    const res = await $api<{ dataUri: string; backupCodes: string[] }>("/api/two-factor-auth");
    if (res?.dataUri) {
      twoFaImage.value = res.dataUri;
      backupCodes.value = res.backupCodes || [];
      showQRCode.value = true;
      toast.add({
        color: "success",
        description: "QR code generated. Scan it and verify with your app code.",
      });
    }
  } catch (error: unknown) {
    toast.add({
      color: "error",
      description: getErrorMessage(error) || "Failed to start authenticator setup.",
    });
  } finally {
    isTwoFaSaving.value = false;
  }
}

async function verifyTwoFa() {
  if (!twoFaFormState.twoFactorCode.trim()) {
    toast.add({
      color: "error",
      description: "Please enter your authenticator code.",
    });
    return;
  }

  isTwoFaSaving.value = true;
  try {
    const res = await $api<User>("/api/verify-two-factor-auth", {
      method: "POST",
      body: { token: twoFaFormState.twoFactorCode.trim() },
    });
    authStore.setUser(res);
    resetTotpSetup();
    toast.add({
      color: "success",
      description: "Authenticator app has been enabled.",
    });
  } catch (error: unknown) {
    toast.add({
      color: "error",
      description: getErrorMessage(error) || "Invalid authenticator code.",
    });
  } finally {
    isTwoFaSaving.value = false;
  }
}

async function addPasskey() {
  isTwoFaSaving.value = true;
  try {
    const options = await $api("/api/mfa/passkey/register-options", {
      method: "POST",
    });
    const response = await startRegistration(options as any);
    const res = await $api<User>("/api/mfa/passkey/register-verify", {
      method: "POST",
      body: {
        response,
        name: twoFaFormState.passkeyName.trim() || undefined,
      },
    });
    authStore.setUser(res);
    twoFaFormState.passkeyName = "";
    toast.add({
      color: "success",
      description: "Security key added.",
    });
  } catch (error: unknown) {
    toast.add({
      color: "error",
      description: getErrorMessage(error) || "Failed to add security key.",
    });
  } finally {
    isTwoFaSaving.value = false;
  }
}

async function removePasskey(id: string) {
  isTwoFaSaving.value = true;
  try {
    const res = await $api<User>("/api/mfa/passkey/delete", {
      method: "POST",
      body: { id },
    });
    authStore.setUser(res);
    toast.add({
      color: "success",
      description: "Security key removed.",
    });
  } catch (error: unknown) {
    toast.add({
      color: "error",
      description: getErrorMessage(error) || "Failed to remove security key.",
    });
  } finally {
    isTwoFaSaving.value = false;
  }
}

async function toggleEmailOtp() {
  isTwoFaSaving.value = true;
  try {
    const enabled = !emailOtpEnabled.value;
    const res = await $api<User>("/api/mfa/email/toggle", {
      method: "POST",
      body: { enabled },
    });
    authStore.setUser(res);
    toast.add({
      color: "success",
      description: enabled ? "Email OTP enabled." : "Email OTP disabled.",
    });
  } catch (error: unknown) {
    toast.add({
      color: "error",
      description: getErrorMessage(error) || "Failed to update email OTP setting.",
    });
  } finally {
    isTwoFaSaving.value = false;
  }
}

async function disable2fa() {
  isTwoFaSaving.value = true;
  try {
    const res = await $api<User>("/api/disable-two-factor-auth", {
      method: "POST",
    });
    authStore.setUser(res);
    resetTotpSetup();
    toast.add({
      color: "success",
      description: "All two-factor methods have been disabled.",
    });
  } catch (error: unknown) {
    toast.add({
      color: "error",
      description: getErrorMessage(error) || "Failed to disable two-factor authentication.",
    });
  } finally {
    isTwoFaSaving.value = false;
  }
}

function resetTotpSetup() {
  showQRCode.value = false;
  twoFaImage.value = "";
  twoFaFormState.twoFactorCode = "";
  backupCodes.value = [];
  showBackupCodes.value = false;
}

function toggleBackupCodes() {
  showBackupCodes.value = !showBackupCodes.value;
}
</script>

<template lang="pug">
div(class="max-w-2xl min-h-96 my-4 m-auto space-y-5")
  h2(class="text-xl font-bold text-center mb-3") Two-Factor Authentication

  div(class="rounded-lg border border-gray-200 dark:border-gray-800 p-4")
    .flex.items-center.justify-between.mb-3
      h3(class="font-semibold") Authenticator app (TOTP)
      span(
        class="text-xs px-2 py-1 rounded-full"
        :class="hasTotpEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'"
      ) {{ hasTotpEnabled ? 'Enabled' : 'Not enabled' }}

    UForm(:state="twoFaFormState" :disabled="isTwoFaSaving" :loading="isTwoFaSaving")
      template(v-if="showQRCode")
        .text-center.mb-4
          div(class="flex items-center justify-center gap-3 mb-4 p-3 rounded-lg bg-gray-100 dark:bg-gray-800/60")
            NuxtImg(
              src="https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_128/v1737776329/pepe_solo_t0twqk.png"
              width="40"
              height="40"
              sizes="40px"
              alt="Dineros"
              class="size-10 rounded-full ring-2 ring-gray-300 dark:ring-gray-600")
            div(class="text-left")
              span(class="font-semibold text-gray-900 dark:text-gray-100") Dineros.cc
              p(class="text-xs text-gray-600 dark:text-gray-400") This account will appear with this name and your email in your app
          img(:src="twoFaImage" alt="QR code — scan with your authenticator app" class="mx-auto mb-4 max-w-64")

        div(
          class="mb-4 p-4 rounded-lg border border-amber-200/90 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/30"
        )
          h3(class="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2") Emergency backup codes
          p(class="text-xs text-amber-800 dark:text-amber-300/90 mb-3") Save these backup codes in a secure location.

          .flex.items-center.justify-between.mb-2
            UButton(
              color="warning"
              variant="subtle"
              size="sm"
              @click="toggleBackupCodes"
              class="text-xs"
            ) {{ showBackupCodes ? 'Hide' : 'Show' }} backup codes

          template(v-if="showBackupCodes")
            .grid.grid-cols-2.gap-2.mb-3
              div(
                v-for="code in backupCodes"
                :key="code"
                class="text-center p-2 rounded font-mono text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900/80 text-gray-900 dark:text-gray-100"
              ) {{ code }}

        UFormField(label="Authentication code" for="twoFactorCode")
          UInput(
            v-model="twoFaFormState.twoFactorCode"
            type="text"
            placeholder="Enter 6-digit code"
            class="w-full"
            maxlength="6"
            pattern="[0-9]{6}"
            autocomplete="one-time-code"
          )

        .flex.gap-2.mt-4
          UButton(
            color="primary"
            size="lg"
            :disabled="isTwoFaSaving || !twoFaFormState.twoFactorCode.trim()"
            :loading="isTwoFaSaving"
            @click="verifyTwoFa"
            class="flex-1"
          ) Verify code
          UButton(
            color="neutral"
            size="lg"
            :disabled="isTwoFaSaving"
            @click="resetTotpSetup"
            class="flex-1"
          ) Cancel

      UButton(
        v-else=""
        color="primary"
        class="mt-2"
        size="sm"
        @click="twoFactorAuth"
        :disabled="isTwoFaSaving || hasTotpEnabled"
        :loading="isTwoFaSaving"
      ) {{ hasTotpEnabled ? 'Already enabled' : 'Enable authenticator app' }}

  div(class="rounded-lg border border-gray-200 dark:border-gray-800 p-4")
    .flex.items-center.justify-between.mb-3
      h3(class="font-semibold") Security keys / passkeys
      span(class="text-xs text-gray-600 dark:text-gray-400") {{ passkeys.length }} registered

    UFormField(label="Label (optional)" for="passkeyName")
      UInput(
        id="passkeyName"
        v-model="twoFaFormState.passkeyName"
        type="text"
        placeholder="MacBook Touch ID, YubiKey, etc."
        class="w-full"
      )
    .flex.gap-2.mt-3
      UButton(
        color="primary"
        size="sm"
        @click="addPasskey"
        :disabled="isTwoFaSaving"
        :loading="isTwoFaSaving"
      ) Add passkey

    div(v-if="passkeys.length > 0" class="mt-4 space-y-2")
      div(
        v-for="passkey in passkeys"
        :key="passkey.id"
        class="flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 px-3 py-2"
      )
        div
          p(class="text-sm font-medium") {{ passkey.name || 'Security key' }}
          p(class="text-xs text-gray-500 dark:text-gray-400") {{ passkey.id }}
        UButton(
          color="error"
          variant="ghost"
          size="xs"
          @click="removePasskey(passkey.id)"
          :disabled="isTwoFaSaving"
        ) Remove

  div(class="rounded-lg border border-gray-200 dark:border-gray-800 p-4")
    .flex.items-center.justify-between
      div
        h3(class="font-semibold") Email verification code
        p(class="text-xs text-gray-500 dark:text-gray-400") Send a one-time login code to your account email
      UButton(
        :color="emailOtpEnabled ? 'neutral' : 'primary'"
        size="sm"
        @click="toggleEmailOtp"
        :disabled="isTwoFaSaving"
        :loading="isTwoFaSaving"
      ) {{ emailOtpEnabled ? 'Disable' : 'Enable' }}

  div(v-if="hasAnyMfaEnabled" class="pt-2")
    UButton(
      color="error"
      size="md"
      class="w-full"
      @click="disable2fa"
      :disabled="isTwoFaSaving"
      :loading="isTwoFaSaving"
    ) Disable all two-factor methods
</template>
