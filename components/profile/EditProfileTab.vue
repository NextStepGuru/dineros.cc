<script setup lang="ts">
import { handleError } from "~/lib/utils";
import { ALL_TIMEZONE_OPTIONS as allTimezoneOptions } from "~/lib/timezoneOptions";
import type { FormSubmitEvent } from "@nuxt/ui";
import type { z } from "zod";
import type { User } from "../../types/types";

import { publicProfileSchema } from "~/schema/zod";

interface Country {
  id: number;
  name: string;
  code: string;
  code3: string;
}

type ProfileSchemaType = z.infer<typeof publicProfileSchema>;
const profileSchema = publicProfileSchema;

const toast = useToast();
const authStore = useAuthStore();
const $api = useNuxtApp().$api as typeof $fetch;

const formState = ref<Partial<User>>(authStore.getUser || {});
const isProfileSaving = ref(false);

// Fetch countries for dropdown
const countries = ref<Country[]>([]);
const isLoadingCountries = ref(true);
const countryOptions = computed(() => {
  if (countries.value.length === 0) {
    return [{ label: "Loading countries...", value: 840 }];
  }
  return countries.value.map((country) => ({
    label: `${country.name} (${country.code})`,
    value: country.id,
  }));
});

// Load countries on component mount
onMounted(async () => {
  try {
    isLoadingCountries.value = true;
    const list = await $api<Country[]>("/api/countries");
    if (list?.length > 0) {
      countries.value = list;
    } else {
      countries.value = [
        { id: 840, name: "United States", code: "US", code3: "USA" },
      ];
    }
  } catch {
    countries.value = [
      { id: 840, name: "United States", code: "US", code3: "USA" },
    ];
  } finally {
    isLoadingCountries.value = false;
  }
});

// Watch for country changes and suggest appropriate timezone
watch(
  () => formState.value.countryId,
  (newCountryId) => {
    if (newCountryId && timezoneOptions.value.length > 0) {
      // Auto-select the first timezone for the selected country
      const firstTimezone = timezoneOptions.value[0];
      if (
        firstTimezone &&
        formState.value.timezoneOffset !== firstTimezone.value
      ) {
        formState.value.timezoneOffset = firstTimezone.value;
      }
    }
  },
);

// Computed timezone options filtered by selected country
const timezoneOptions = computed(() => {
  const selectedCountryId = formState.value.countryId;
  if (!selectedCountryId) {
    return allTimezoneOptions; // Show all if no country selected
  }

  const filteredOptions = allTimezoneOptions.filter((option) =>
    option.countries.includes(selectedCountryId),
  );

  // If no specific timezones found for the country, show all options
  return filteredOptions.length > 0 ? filteredOptions : allTimezoneOptions;
});

// Set default country if not already set
if (!formState.value.countryId) {
  formState.value.countryId = 840; // Default to United States
}

// Set default timezone if not already set
if (!formState.value.timezoneOffset) {
  formState.value.timezoneOffset = -300; // Default to EST
}

// Set default daylight saving if not already set
if (formState.value.isDaylightSaving === undefined) {
  formState.value.isDaylightSaving = true; // Default to daylight saving time
}

// Computed property for selected timezone info
const selectedTimezoneInfo = computed(() => {
  if (!formState.value.timezoneOffset) return null;
  const timezone = allTimezoneOptions.find(
    (tz) => tz.value === formState.value.timezoneOffset,
  );
  return timezone
    ? {
        name: timezone.name,
        offset: timezone.value,
        label: timezone.label,
      }
    : null;
});

// Submit handler
const handleSubmit = async ({
  data: formData,
}: FormSubmitEvent<ProfileSchemaType>) => {
  try {
    isProfileSaving.value = true;
    const responseData = await $api<User>("/api/user", {
      method: "POST",
      body: formData,
    });
    formState.value.firstName = responseData?.firstName || "";
    formState.value.lastName = responseData?.lastName || "";
    formState.value.email = responseData?.email || "";
    formState.value.countryId = responseData?.countryId || 840;
    formState.value.timezoneOffset = responseData?.timezoneOffset || -300;
    formState.value.isDaylightSaving = responseData?.isDaylightSaving ?? true;
    toast.add({
      color: "success",
      description: "Profile updated successfully.",
    });
  } catch (e: unknown) {
    let msg = "An error occurred during profile update.";
    if (e && typeof e === "object" && "data" in e) {
      msg = String((e as { data?: { message?: string } }).data?.message);
    } else if (
      e &&
      typeof e === "object" &&
      "message" in e &&
      typeof (e as { message: string }).message === "string"
    ) {
      msg = (e as { message: string }).message;
    }
    toast.add({ color: "error", description: msg });
  } finally {
    isProfileSaving.value = false;
  }
};

// Expose handleError to template
const handleErrorForTemplate = handleError;
</script>

<template lang="pug">
div(class="max-w-2xl mx-auto")
  UForm(class="space-y-4" @submit.prevent="handleSubmit" :state="formState" :schema="profileSchema" @error="handleError($event, toast)" :disabled="isProfileSaving")
    UFormField(label="First Name" for="firstName")
      UInput(
        id="firstName"
        v-model="formState.firstName"
        type="text"
        placeholder="Enter your first name"
        autocomplete="given-name"
        class="w-full"
      )
    UFormField(label="Last Name" for="lastName")
      UInput(
        id="lastName"
        v-model="formState.lastName"
        type="text"
        placeholder="Enter your last name"
        autocomplete="family-name"
        class="w-full"
      )
    UFormField(label="Email Address" for="email")
      UInput(
        id="email"
        v-model="formState.email"
        type="text"
        placeholder="Enter your email"
        autocomplete="email"
        required
        class="w-full"
      )
    UFormField(label="Country" for="countryId")
      USelect(
        id="countryId"
        v-model="formState.countryId"
        class="w-full"
        :items="countryOptions"
        value-key="value"
        label-key="label"
        :placeholder="isLoadingCountries ? 'Loading countries...' : 'Select your country'"
        :disabled="isProfileSaving || isLoadingCountries"
      )
    UFormField(label="Timezone" for="timezoneOffset")
      USelectMenu(
        id="timezoneOffset"
        v-model="formState.timezoneOffset"
        class="w-full"
        :items="timezoneOptions"
        value-key="value"
        label-key="label"
        placeholder="Select your timezone"
        :disabled="isProfileSaving"
      )

    UFormField(label="Daylight Saving Time" for="isDaylightSaving")
      UCheckbox(
        v-model="formState.isDaylightSaving"
        name="isDaylightSaving"
        :disabled="isProfileSaving"
        label="Currently observing Daylight Saving Time"
      )
      p.text-sm.text-gray-500.mt-1
        | Check this box if your location is currently observing Daylight Saving Time (DST)

      p.text-sm.text-gray-500.mt-1(v-if="selectedTimezoneInfo")
        | Selected: {{ selectedTimezoneInfo.name }} ({{ selectedTimezoneInfo.offset > 0 ? '+' : '' }}{{ selectedTimezoneInfo.offset / 60 }} hours from UTC)
        span(v-if="formState.isDaylightSaving") + DST
    UButton(
      color="primary"
      size="lg"
      type="submit"
      :disabled="isProfileSaving"
      :loading="isProfileSaving"
    ) Update Profile
</template>
