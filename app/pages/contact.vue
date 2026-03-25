<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { handleError } from "~/lib/utils";

const runtimeConfig = useRuntimeConfig();
const siteUrl = runtimeConfig.public.siteUrl || "https://dineros.cc";
const canonicalUrl = `${siteUrl}/contact`;
const publishedAt = "2026-03-14T00:00:00.000Z";
const authorName = "Dineros Editorial Team";
const socialImageUrl =
  "https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_128/v1737776329/pepe_solo_t0twqk.png";
const pageJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Contact Dineros",
  author: {
    "@type": "Organization",
    name: authorName,
  },
  datePublished: publishedAt,
  dateModified: publishedAt,
  url: canonicalUrl,
};

useServerSeoMeta({
  title: "Contact Dineros | Support, Privacy, and Legal Requests",
  description:
    "Contact Dineros for support, privacy requests, or legal questions about predictive budgeting and account forecasting services.",
  robots: "index, follow, max-image-preview:large",
  ogTitle: "Contact Dineros | Support, Privacy, and Legal Requests",
  ogDescription:
    "Contact Dineros for support, privacy requests, or legal questions about predictive budgeting and account forecasting services.",
  ogType: "article",
  ogUrl: canonicalUrl,
  ogImage: socialImageUrl,
  articlePublishedTime: publishedAt,
  articleModifiedTime: publishedAt,
  author: authorName,
  twitterCard: "summary",
  twitterTitle: "Contact Dineros | Support, Privacy, and Legal Requests",
  twitterDescription:
    "Contact Dineros for support, privacy requests, or legal questions about predictive budgeting and account forecasting services.",
  twitterImage: socialImageUrl,
});

useHead({
  link: [{ rel: "canonical", href: canonicalUrl }],
  meta: [
    { name: "datePublished", content: publishedAt },
    { name: "dateModified", content: publishedAt },
  ],
  script: [
    {
      type: "application/ld+json",
      innerHTML: JSON.stringify(pageJsonLd),
    },
  ],
});

const toast = useToast();
const contactReasonOptions = [
  { value: "general", label: "General inquiry" },
  { value: "support", label: "Account support" },
  { value: "privacy", label: "Privacy request" },
  { value: "legal", label: "Legal" },
  { value: "bug", label: "Bug report" },
  { value: "feedback", label: "Product feedback" },
  { value: "other", label: "Other" },
];

const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  reason: z.string().min(1, "Please select a reason"),
  subject: z.string().optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
});
type ContactSchemaType = z.infer<typeof contactSchema>;
const formState = ref<Partial<ContactSchemaType>>({
  name: "",
  email: "",
  reason: "",
  subject: "",
  message: "",
});

const supportEmail = "support@dineros.cc";

function onFormError(event: Parameters<typeof handleError>[0]) {
  handleError(event, toast);
}

function sendMessage({ data }: FormSubmitEvent<ContactSchemaType>) {
  const { name, email, reason, subject, message } = data;
  const reasonLabel =
    contactReasonOptions.find((o) => o.value === reason)?.label ?? reason;
  const body = [
    "",
    "---",
    `From: ${name} <${email}>`,
    `Reason: ${reasonLabel}`,
    "",
    message,
  ].join("\n");
  const subjectLine = subject || `[${reasonLabel}] Contact from Dineros`;
  const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent(subjectLine)}&body=${encodeURIComponent(body)}`;
  globalThis.location.href = mailto;
  toast.add({
    color: "success",
    description: "Opening your email client to send your message.",
  });
  formState.value = {
    name: "",
    email: "",
    reason: "",
    subject: "",
    message: "",
  };
}

const contactMethods = [
  {
    label: "Support",
    value: "support@dineros.cc",
    href: "mailto:support@dineros.cc",
    icon: "i-lucide-mail",
    external: false,
  },
  {
    label: "Privacy",
    value: "privacy@dineros.cc",
    href: "mailto:privacy@dineros.cc",
    icon: "i-lucide-shield",
    external: false,
  },
  {
    label: "Legal",
    value: "legal@dineros.cc",
    href: "mailto:legal@dineros.cc",
    icon: "i-lucide-file-text",
    external: false,
  },
] as const;
</script>

<template>
  <div
    class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16"
    itemscope
    itemtype="https://schema.org/Article"
  >
    <div class="text-center mb-12">
      <h1
        class="text-3xl font-bold tracking-tight frog-text sm:text-4xl"
        itemprop="headline"
      >
        Contact us
      </h1>
      <p class="mt-2 text-sm frog-text-muted hidden">
        By <span itemprop="author">Dineros Editorial Team</span> •
        <time itemprop="datePublished" datetime="2026-03-14T00:00:00.000Z"
          >Published March 14, 2026</time
        >
      </p>
      <p class="mt-3 text-lg frog-text-muted max-w-2xl mx-auto">
        Have a question or feedback? Send us a message and we’ll get back to you
        as soon as we can.
      </p>
      <p class="mt-4 text-sm frog-text-muted max-w-3xl mx-auto">
        Dineros support can help with account access, forecasting setup, budget
        structure questions, recurring schedule behavior, and general product
        guidance. For privacy and legal inquiries, we route requests directly to
        dedicated inboxes so your message reaches the right team quickly.
      </p>
      <p class="mt-3 text-sm frog-text-muted max-w-3xl mx-auto">
        Include the email on your profile, the page you were using, and what you
        expected to happen. For bug reports, add the exact steps and any error
        text shown on screen. This helps us respond faster without extra back
        and forth.
      </p>
    </div>

    <div class="grid gap-8 lg:grid-cols-2">
      <UCard class="lg:order-2">
        <template #header>
          <h2 class="text-lg font-semibold">Get in touch</h2>
        </template>
        <UForm
          :schema="contactSchema"
          :state="formState"
          class="auth-form w-full"
          @submit="sendMessage"
          @error="onFormError"
        >
          <UFormField label="Name" name="name">
            <UInput
              v-model="formState.name"
              placeholder="Your name"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Email" name="email">
            <UInput
              v-model="formState.email"
              type="email"
              placeholder="you@example.com"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Why are you contacting?" name="reason">
            <USelect
              id="reason"
              v-model="formState.reason"
              name="reason"
              class="w-full"
              placeholder="Select a reason"
              :items="contactReasonOptions"
              value-key="value"
              label-key="label"
            />
          </UFormField>
          <UFormField label="Subject" name="subject">
            <UInput
              v-model="formState.subject"
              placeholder="How can we help?"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Message" name="message">
            <UTextarea
              v-model="formState.message"
              placeholder="Your message..."
              :rows="4"
              class="w-full min-w-0"
            />
          </UFormField>
          <UButton type="submit" color="primary" size="lg" class="w-full">
            Send message
          </UButton>
        </UForm>
      </UCard>

      <div class="space-y-6 lg:order-1">
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">Contact information</h2>
          </template>
          <ul class="space-y-4">
            <li
              v-for="method in contactMethods"
              :key="method.label"
              class="flex items-start gap-3"
            >
              <UIcon
                :name="method.icon"
                class="size-5 text-primary shrink-0 mt-0.5"
              />
              <div class="min-w-0">
                <p class="text-sm font-medium frog-text-muted">
                  {{ method.label }}
                </p>
                <ULink
                  :to="method.href"
                  :target="method.external ? '_blank' : undefined"
                  :rel="method.external ? 'noopener noreferrer' : undefined"
                  class="text-base frog-text hover:text-primary wrap-break-word"
                >
                  {{ method.value }}
                </ULink>
              </div>
            </li>
          </ul>
        </UCard>
        <p class="text-sm frog-text-muted">
          For account support, include the email tied to your account. For
          privacy or data requests, use the addresses above so we can route and
          track your request correctly.
        </p>
        <p class="text-sm frog-text-muted">
          Review our
          <ULink to="/privacy-policy" class="frog-link hover:underline">
            Privacy Policy
          </ULink>
          and
          <ULink to="/terms-of-service" class="frog-link hover:underline">
            Terms of Service
          </ULink>
          for full details.
        </p>
      </div>
    </div>
  </div>
</template>
