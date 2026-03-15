<script setup lang="ts">
const runtimeConfig = useRuntimeConfig();
const siteUrl = runtimeConfig.public.siteUrl || "https://dineros.cc";
const canonicalUrl = `${siteUrl}/about`;
const publishedAt = "2026-03-14T00:00:00.000Z";
const authorName = "Dineros Editorial Team";
const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "About Dineros",
  author: {
    "@type": "Organization",
    name: authorName,
  },
  datePublished: publishedAt,
  dateModified: publishedAt,
  mainEntityOfPage: canonicalUrl,
};

useServerSeoMeta({
  title: "About Dineros | Predictive Budgeting Platform",
  description:
    "Learn about Dineros, a predictive budgeting platform focused on account forecasting, recurring transaction planning, and secure financial workflows.",
  robots: "index, follow, max-image-preview:large",
  ogTitle: "About Dineros | Predictive Budgeting Platform",
  ogDescription:
    "Learn about Dineros, a predictive budgeting platform focused on account forecasting, recurring transaction planning, and secure financial workflows.",
  ogType: "article",
  ogUrl: canonicalUrl,
  articlePublishedTime: publishedAt,
  articleModifiedTime: publishedAt,
  author: authorName,
  twitterCard: "summary",
  twitterTitle: "About Dineros | Predictive Budgeting Platform",
  twitterDescription:
    "Learn about Dineros, a predictive budgeting platform focused on account forecasting, recurring transaction planning, and secure financial workflows.",
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
      children: JSON.stringify(articleJsonLd),
    },
  ],
});
</script>

<template lang="pug">
section(class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16" itemscope itemtype="https://schema.org/Article")
  h1(class="text-3xl font-bold tracking-tight" itemprop="headline") About Dineros
  p(class="mt-2 text-sm frog-text-muted")
    | By
    span(itemprop="author") Dineros Editorial Team
    |  •
    time(itemprop="datePublished" datetime="2026-03-14T00:00:00.000Z") Published March 14, 2026
  p(class="mt-4 text-base leading-7 frog-text")
    | Dineros is a predictive budgeting platform built to help people and teams
    | make better money decisions before issues happen.
  p(class="mt-4 text-base leading-7 frog-text")
    | Instead of only showing historical transactions, Dineros focuses on
    | forward-looking planning with account registers, recurring schedules, and
    | cash-flow forecasting.
  p(class="mt-4 text-base leading-7 frog-text")
    | Our product is designed with practical financial workflows in mind and
    | supports secure account experiences including optional two-factor
    | authentication and integration-based data sync.
  p(class="mt-4 text-base leading-7 frog-text")
    | We built Dineros around a core planning principle: confidence comes from
    | visibility. If you can see expected inflows, recurring obligations, and
    | projected balances in a single place, it becomes easier to avoid overdrafts,
    | reduce short-notice stress, and choose a spending cadence that matches your
    | priorities.
  p(class="mt-4 text-base leading-7 frog-text")
    | The product experience focuses on practical outcomes instead of financial
    | jargon. Account registers provide a familiar foundation, recurring schedules
    | remove repetitive data entry, and forecasting helps convert raw transaction
    | data into decisions you can act on before deadlines hit.
  p(class="mt-4 text-base leading-7 frog-text")
    | Dineros is developed by a team that values secure defaults, transparent
    | policies, and responsible handling of sensitive financial workflows. We
    | continue improving reliability, accessibility, and planning clarity so the
    | app stays useful as your budgeting process grows more complex over time.
  p(class="mt-4 text-base leading-7 frog-text")
    | We also invest in making the experience readable and actionable for different
    | planning styles. Some people track cash flow weekly, others plan around monthly
    | commitments or variable freelance income. Dineros supports both by keeping
    | projected balances tied to recurring events and account-level context.
  p(class="mt-4 text-base leading-7 frog-text")
    | As we continue shipping updates, our focus remains practical: reduce manual
    | effort, make forecast assumptions transparent, and help users answer the
    | question that matters most before spending decisions are final—what changes if
    | this payment happens now versus later.
  p(class="mt-4 text-base leading-7 frog-text")
    | We maintain a strong bias for predictable behavior and clear data ownership.
    | Users should always understand what changed, why a forecast moved, and where
    | upcoming obligations are represented in the register timeline. That
    | transparency is central to trust and long-term budgeting consistency.
  p(class="mt-6 text-sm frog-text-muted")
    | Learn more about how we handle your information in our
    |
    NuxtLink(to="/privacy-policy" class="frog-link hover:underline") Privacy Policy
    |  and review service rules in our
    |
    NuxtLink(to="/terms-of-service" class="frog-link hover:underline") Terms of Service
    | .
</template>
