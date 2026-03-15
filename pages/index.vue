<script setup lang="ts">
const runtimeConfig = useRuntimeConfig();
const siteUrl = runtimeConfig.public.siteUrl || "https://dineros.cc";
const canonicalUrl = `${siteUrl}/`;
const heroImageUrl =
  "https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_640/v1737776329/pepe_solo_t0twqk.png";

useServerSeoMeta({
  title: "Dineros | Predictive Budgeting and Cash Flow Forecasting",
  description:
    "Dineros helps you forecast balances, automate recurring transaction tracking, and plan spending with confidence using secure financial workflows.",
  robots: "index, follow, max-image-preview:large",
  ogTitle: "Dineros | Predictive Budgeting and Cash Flow Forecasting",
  ogDescription:
    "Forecast before you spend with predictive budgeting, recurring transaction automation, and secure account sync.",
  ogType: "website",
  ogUrl: canonicalUrl,
  twitterCard: "summary_large_image",
  twitterTitle: "Dineros | Predictive Budgeting and Cash Flow Forecasting",
  twitterDescription:
    "Forecast before you spend with predictive budgeting, recurring transaction automation, and secure account sync.",
});

useHead({
  link: [
    { rel: "canonical", href: canonicalUrl },
    { rel: "preload", as: "image", href: heroImageUrl },
  ],
});

const links = ref([
  {
    label: "Start with sign in",
    to: "/login",
    icon: "i-lucide-arrow-right",
    trailing: true,
    color: "primary" as const,
    variant: "solid" as const,
    class: "frog-cta",
    size: "xl" as const,
  },
  {
    label: "See how it works",
    to: "#features",
    color: "primary" as const,
    variant: "soft" as const,
    class: "frog-cta",
    size: "xl" as const,
  },
]);

const features = [
  {
    icon: "i-lucide-bar-chart-3",
    title: "Forecast Before You Spend",
    description:
      "Model upcoming balances and spot cash flow risk before bills hit your account.",
  },
  {
    icon: "i-lucide-repeat",
    title: "Recurring Money, Automated",
    description:
      "Track paychecks, subscriptions, and fixed bills automatically instead of re-entering the same data.",
  },
  {
    icon: "i-lucide-shield-check",
    title: "Secure by Design",
    description:
      "Use encrypted financial data, optional 2FA, and Plaid account sync with confidence.",
  },
];
</script>

<template>
  <div class="page-home">
    <UPageHero
      class="frog-hero flex items-center justify-center min-h-[calc(100vh-var(--ui-header-height))]"
      title="See your money before it moves"
      description="Dineros combines predictive budgeting, recurring transaction automation, and account-level forecasting so you can make better decisions earlier."
      :links="links"
      headline="Predictive Budgeting for Real Life"
      orientation="horizontal">
      <PepeHeroSvg class="w-md" />
    </UPageHero>

    <section
      id="features"
      class="frog-features py-24 sm:py-32">
      <div class="max-w-(--ui-container) mx-auto px-4 sm:px-6 lg:px-8">
        <h2
          class="text-center text-3xl font-bold tracking-tight sm:text-4xl frog-heading">
          Built for decisions, not data entry
        </h2>
        <p
          class="mt-4 text-center text-lg max-w-2xl mx-auto frog-subheading">
          Replace spreadsheet guesswork with clear next-step visibility across
          your budgets, accounts, and recurring transactions.
        </p>

        <div class="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="frog-feature-card group relative rounded-2xl p-8 backdrop-blur transition">
            <div
              class="frog-feature-icon mb-4 inline-flex items-center justify-center rounded-xl p-3">
              <UIcon :name="feature.icon" class="size-6 frog-icon" />
            </div>
            <h3 class="text-lg font-semibold frog-heading">
              {{ feature.title }}
            </h3>
            <p class="mt-2 text-sm leading-relaxed frog-subheading">
              {{ feature.description }}
            </p>
          </div>
        </div>

        <p class="mt-10 text-center text-sm frog-subheading">
          Powered by account registers, recurring schedules, secure Plaid sync,
          and two-factor authentication.
        </p>
      </div>
    </section>

    <section class="py-20 frog-surface">
      <div class="max-w-(--ui-container) mx-auto px-4 sm:px-6 lg:px-8">
        <h2 class="text-3xl font-bold tracking-tight frog-text">How Dineros helps day-to-day</h2>
        <p class="mt-5 text-base leading-7 frog-text">
          Dineros is designed for people who want more than a static ledger. Instead
          of waiting for transactions to settle and then reacting, you can map upcoming
          paychecks, bills, subscriptions, and planned spending into one timeline.
          That timeline gives you a practical look at what your balances are likely to
          be next week, next month, and around known high-expense dates.
        </p>
        <p class="mt-4 text-base leading-7 frog-text">
          As your transaction history grows, recurring entries reduce the need for
          repetitive manual updates. You can spend less time copying values and more
          time deciding what to prioritize. Forecasting is most useful when it is
          easy to understand, so Dineros keeps account-level projections connected to
          the budget context you already use to make decisions.
        </p>
        <p class="mt-4 text-base leading-7 frog-text">
          Security is part of the product workflow, not an afterthought. Encrypted
          financial records, optional two-factor authentication, and explicit account
          controls help you manage access while keeping your planning process fast.
          Whether you are organizing household cash flow or coordinating shared
          spending priorities, the goal is simple: reduce surprises and make better
          decisions earlier.
        </p>
        <p class="mt-4 text-base leading-7 frog-text">
          Many budgeting tools are great at recording the past, but Dineros is tuned
          for planning the next decision. You can compare likely outcomes before
          making transfers, subscription changes, or large purchases. That helps turn
          your budget from a historical report into a practical planning instrument.
        </p>
      </div>
    </section>
  </div>
</template>
