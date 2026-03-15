<script setup lang="ts">
const runtimeConfig = useRuntimeConfig();
const siteUrl = runtimeConfig.public.siteUrl || "https://dineros.cc";
const canonicalUrl = `${siteUrl}/privacy-policy`;
const publishedAt = "2026-03-14T00:00:00.000Z";
const authorName = "Dineros Editorial Team";
const socialImageUrl =
  "https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_128/v1737776329/pepe_solo_t0twqk.png";
const policyJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Dineros Privacy Policy",
  author: {
    "@type": "Organization",
    name: authorName,
  },
  datePublished: publishedAt,
  dateModified: publishedAt,
  url: canonicalUrl,
};

useServerSeoMeta({
  title: "Dineros Privacy Policy | Data Collection and Privacy Rights",
  description:
    "Review the Dineros Privacy Policy to understand what personal data we collect, how we use it, how we share it, and your privacy rights.",
  robots: "index, follow, max-image-preview:large",
  ogTitle: "Dineros Privacy Policy | Data Collection and Privacy Rights",
  ogDescription:
    "Review the Dineros Privacy Policy to understand what personal data we collect, how we use it, how we share it, and your privacy rights.",
  ogType: "article",
  ogUrl: canonicalUrl,
  ogImage: socialImageUrl,
  articlePublishedTime: publishedAt,
  articleModifiedTime: publishedAt,
  author: authorName,
  twitterCard: "summary_large_image",
  twitterTitle: "Dineros Privacy Policy | Data Collection and Privacy Rights",
  twitterDescription:
    "Review the Dineros Privacy Policy to understand what personal data we collect, how we use it, how we share it, and your privacy rights.",
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
      children: JSON.stringify(policyJsonLd),
    },
  ],
});
</script>

<template lang="pug">
div(class="legal-document" itemscope itemtype="https://schema.org/Article")
  header(class="legal-document__header")
    h1 Privacy Policy
    p(class="legal-document__meta")
      span(itemprop="author") Dineros Editorial Team
      |  ·
      time(itemprop="datePublished" datetime="2026-03-14T00:00:00.000Z") Published March 14, 2026
    span(class="legal-document__effective") Effective Date: March 14, 2026

  div(class="legal-document__body")
    section
      h2 1. Scope and Controller
      p
        | Linear Budgeting LLC, doing business as Dineros.cc ("Dineros," "we," "our," or "us"), describes in this Privacy Policy how we collect, use, disclose, and protect personal information when you use our website, applications, and related services (collectively, the "Services").
      p
        | This Privacy Policy applies to information we process as a data controller for account management, budgeting tools, forecasting features, and support operations.

    section
      h2 2. Information We Collect
      h3 a. Information You Provide
      ul
        li Account details such as first name, last name, email address, and password credentials.
        li Profile and settings information you choose to provide.
        li Support communications and messages sent to us.
      h3 b. Financial and Account Data
      ul
        li Account register data, recurring transaction data, and budgeting inputs you create or import.
        li
          | Connected financial account metadata and transaction data received through integrations such as Plaid, if you choose to connect accounts.
          |  Plaid data handling is also subject to
          a(href="https://plaid.com/legal/#privacy-policy" target="_blank" rel="noopener noreferrer")  Plaid's End User Privacy Policy
          |  and
          a(href="https://plaid.com/legal/" target="_blank" rel="noopener noreferrer")  Plaid legal terms
          | .
      h3 c. Security and Device Data
      ul
        li Log, device, and usage data such as IP address, browser type, timestamps, and interaction events.
        li Authentication and security data, including session/token data and two-factor authentication setup data where enabled.
      h3 d. Cookies and Similar Technologies
      p
        | We use cookies and similar technologies to support authentication, security, preferences, and performance.
      ul
        li
          strong authToken
          | : Essential authentication cookie used to keep you signed in and validate secure sessions.
        li
          strong Session and security cookies
          | : Essential cookies used by our framework and infrastructure providers to maintain secure request handling and prevent abuse.

    section
      h2 3. Sources of Information
      ul
        li Directly from you when you register, configure your account, or submit content.
        li Automatically from your device/browser when you use the Services.
        li From service providers and integration partners (such as Plaid) when you authorize those connections.

    section
      h2 4. How We Use Information
      p
        | We use information for legitimate business and operational purposes, including to:
      ul
        li Provide, maintain, and improve the Services.
        li Authenticate users, secure accounts, and prevent fraud or abuse.
        li Operate budgeting, forecasting, account register, and recurring transaction features.
        li Process and maintain authorized third-party integrations.
        li Communicate service notices, updates, and support responses.
        li Comply with legal obligations and enforce our Terms.

    section
      h2 5. How We Share Information
      p
        | We do not sell personal information. We may disclose information in the following circumstances:
      ul
        li Service providers and infrastructure vendors that process data on our behalf (hosting, analytics, communications, security, and support tools).
        li Financial integration partners you authorize, including Plaid.
        li Professional advisors, auditors, and legal counsel as needed.
        li Law enforcement, regulators, or other parties when required by law or to protect rights, safety, and security.
        li Parties involved in a merger, acquisition, financing, or asset sale, subject to customary confidentiality controls.

    section
      h2 6. Data Retention
      p
        | We retain information for as long as necessary to provide the Services, fulfill the purposes described in this Policy, comply with legal obligations, resolve disputes, and enforce agreements.
      p
        | Retention periods may vary based on the type of data, account status, legal requirements, and security needs.

    section
      h2 7. Security
      p
        | We use administrative, technical, and organizational safeguards designed to protect personal information, including access controls, encryption practices for sensitive data, and account security features such as optional two-factor authentication.
      p
        | No method of transmission or storage is completely secure, and we cannot guarantee absolute security.

    section
      h2 8. International Data Transfers
      p
        | We may process and store information in the United States and other jurisdictions where our service providers operate. Data protection laws in those jurisdictions may differ from those in your location.

    section
      h2 9. Your Privacy Rights and Choices
      p
        | Depending on where you live, you may have rights regarding your personal information, such as rights to access, correct, delete, restrict, or object to certain processing, and rights to data portability where applicable.
      p
        | You may request account deletion or data access by contacting us. We may need to verify your identity and may retain certain records where required by law or for legitimate business purposes.
      p
        | We generally process verified account deletion requests within 30 days and will confirm completion when finished. For linked financial accounts, we will disconnect Plaid-linked access and delete or de-identify associated account data, subject to legal, fraud-prevention, tax, and record-retention requirements.
      p
        | You may also manage some information directly through your account settings.

    section
      h2 10. Cookies and Tracking Controls
      p
        | You can control cookies through your browser settings. Disabling certain cookies may affect authentication, preferences, and feature functionality within the Services.
      p
        | Because key cookies are required for sign-in and account security, blocking essential cookies may prevent you from using authenticated portions of the Services.

    section
      h2(id="california-privacy-rights") 11. Additional Rights for California Residents
      p
        | If you are a California resident, you may have rights under the California Consumer Privacy Act (CCPA/CPRA), including rights to know, access, correct, and delete personal information, and the right to request details about how we collect, use, and disclose personal information.
      p
        | We do not sell personal information and do not share personal information for cross-context behavioral advertising as those terms are defined under California law.
      p
        | To submit a California privacy request, contact us at
        a(href="mailto:privacy@dineros.cc")  privacy@dineros.cc
        | . We will verify your request before fulfilling it and will not discriminate against you for exercising your privacy rights.

    section
      h2 12. Children's Privacy
      p
        | The Services are not directed to children under 18, and we do not knowingly collect personal information from children under 18.

    section
      h2 13. Changes to This Policy
      p
        | We may update this Privacy Policy from time to time. When we do, we will update the effective date and post the revised version on this page.
      p
        | If changes are material, we may provide additional notice through the Services or by email.

    section(class="legal-document__contact-block")
      h2 14. Contact Us
      p
        | If you have questions about this Privacy Policy or want to submit a privacy request, contact us at:
      ul
        li
          | Email:
          a(href="mailto:privacy@dineros.cc")  privacy@dineros.cc
        li
          | Phone:
          a(href="tel:+16152618201")  615-261-8201
        li
          | Address:
          a(href="https://maps.google.com/?q=5753+Highway+85+North+PMB+3496+Crestview+FL+32536" target="_blank" rel="noopener noreferrer")  5753 Highway 85 North PMB 3496, Crestview, FL 32536
</template>
