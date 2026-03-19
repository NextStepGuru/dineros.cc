<script setup lang="ts">
import { handleError } from "~/lib/utils";
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
  }
);

// All timezone options with country mappings
const allTimezoneOptions = [
  {
    label: "Pacific Time (PST/PDT) - UTC-8/-7",
    value: -480,
    name: "PST/PDT",
    countries: [840], // United States
  },
  {
    label: "Mountain Time (MST/MDT) - UTC-7/-6",
    value: -420,
    name: "MST/MDT",
    countries: [840, 124], // United States, Canada
  },
  {
    label: "Central Time (CST/CDT) - UTC-6/-5",
    value: -360,
    name: "CST/CDT",
    countries: [840, 124, 484], // United States, Canada, Mexico
  },
  {
    label: "Eastern Time (EST/EDT) - UTC-5/-4",
    value: -300,
    name: "EST/EDT",
    countries: [840, 124], // United States, Canada
  },
  {
    label: "Atlantic Time (AST/ADT) - UTC-4/-3",
    value: -240,
    name: "AST/ADT",
    countries: [124, 52, 212, 308], // Canada, Barbados, Dominica, Grenada
  },
  {
    label: "Newfoundland Time (NST/NDT) - UTC-3.5/-2.5",
    value: -210,
    name: "NST/NDT",
    countries: [124], // Canada
  },
  {
    label: "Argentina Time (ART) - UTC-3",
    value: -180,
    name: "ART",
    countries: [32, 76, 858], // Argentina, Brazil, Uruguay
  },
  {
    label: "UTC - UTC+0",
    value: 0,
    name: "UTC",
    countries: [826, 372, 620, 288, 694], // United Kingdom, Ireland, Portugal, Ghana, Sierra Leone
  },
  {
    label: "Central European Time (CET/CEST) - UTC+1/+2",
    value: 60,
    name: "CET/CEST",
    countries: [
      276, 250, 380, 724, 528, 56, 756, 40, 348, 616, 203, 703, 705, 191, 688,
      499, 807, 70, 100, 438, 442, 470, 674, 336,
    ], // Germany, France, Italy, Spain, Netherlands, Belgium, Switzerland, Austria, Hungary, Poland, Czech Republic, Slovakia, Slovenia, Croatia, Serbia, Montenegro, North Macedonia, Bosnia and Herzegovina, Bulgaria, Liechtenstein, Luxembourg, Malta, San Marino, Vatican City
  },
  {
    label: "Eastern European Time (EET/EEST) - UTC+2/+3",
    value: 120,
    name: "EET/EEST",
    countries: [300, 246, 233, 428, 440, 642, 804, 112, 818], // Greece, Finland, Estonia, Latvia, Lithuania, Romania, Ukraine, Belarus, Egypt
  },
  {
    label: "Moscow Time (MSK) - UTC+3",
    value: 180,
    name: "MSK",
    countries: [643, 762], // Russia, Tajikistan
  },
  {
    label: "Gulf Standard Time (GST) - UTC+4",
    value: 240,
    name: "GST",
    countries: [784, 512, 414, 634], // United Arab Emirates, Oman, Kuwait, Qatar
  },
  {
    label: "Pakistan Standard Time (PKT) - UTC+5",
    value: 300,
    name: "PKT",
    countries: [586, 356, 398, 860, 417], // Pakistan, India, Kazakhstan, Uzbekistan, Kyrgyzstan
  },
  {
    label: "Bangladesh Standard Time (BST) - UTC+6",
    value: 360,
    name: "BST",
    countries: [50], // Bangladesh
  },
  {
    label: "Indochina Time (ICT) - UTC+7",
    value: 420,
    name: "ICT",
    countries: [764, 704, 418, 116], // Thailand, Vietnam, Laos, Cambodia
  },
  {
    label: "China Standard Time (CST) - UTC+8",
    value: 480,
    name: "CST",
    countries: [156, 458, 702, 608, 96, 344], // China, Malaysia, Singapore, Philippines, Brunei, Hong Kong
  },
  {
    label: "Japan Standard Time (JST) - UTC+9",
    value: 540,
    name: "JST",
    countries: [392, 410], // Japan, South Korea
  },
  {
    label: "Australian Eastern Time (AEST/AEDT) - UTC+10/+11",
    value: 600,
    name: "AEST/AEDT",
    countries: [36], // Australia
  },
  {
    label: "New Zealand Time (NZST/NZDT) - UTC+12/+13",
    value: 720,
    name: "NZST/NZDT",
    countries: [554], // New Zealand
  },
];

// Computed timezone options filtered by selected country
const timezoneOptions = computed(() => {
  const selectedCountryId = formState.value.countryId;
  if (!selectedCountryId) {
    return allTimezoneOptions; // Show all if no country selected
  }

  const filteredOptions = allTimezoneOptions.filter((option) =>
    option.countries.includes(selectedCountryId)
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
    (tz) => tz.value === formState.value.timezoneOffset
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
    const msg =
      e && typeof e === "object" && "data" in e
        ? String((e as { data?: { message?: string } }).data?.message)
        : e &&
            typeof e === "object" &&
            "message" in e &&
            typeof (e as { message: string }).message === "string"
          ? (e as { message: string }).message
          : "An error occurred during profile update.";
    toast.add({ color: "error", description: msg });
  } finally {
    isProfileSaving.value = false;
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
