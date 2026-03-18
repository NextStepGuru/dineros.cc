<script setup lang="ts">
const runtimeConfig = useRuntimeConfig();
const siteUrl = runtimeConfig.public.siteUrl || "https://dineros.cc";
const canonicalUrl = `${siteUrl}/terms-of-service`;
const publishedAt = "2026-03-14T00:00:00.000Z";
const authorName = "Dineros Editorial Team";
const socialImageUrl =
  "https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_128/v1737776329/pepe_solo_t0twqk.png";
const termsJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Dineros Terms of Service",
  author: {
    "@type": "Organization",
    name: authorName,
  },
  datePublished: publishedAt,
  dateModified: publishedAt,
  url: canonicalUrl,
};

useServerSeoMeta({
  title: "Dineros Terms of Service | Account and Platform Use Terms",
  description:
    "Read the Dineros Terms of Service, including eligibility, acceptable use, arbitration terms, class action waiver, and Florida governing law.",
  robots: "index, follow, max-image-preview:large",
  ogTitle: "Dineros Terms of Service | Account and Platform Use Terms",
  ogDescription:
    "Read the Dineros Terms of Service, including eligibility, acceptable use, arbitration terms, class action waiver, and Florida governing law.",
  ogType: "article",
  ogUrl: canonicalUrl,
  ogImage: socialImageUrl,
  articlePublishedTime: publishedAt,
  articleModifiedTime: publishedAt,
  author: authorName,
  twitterCard: "summary_large_image",
  twitterTitle: "Dineros Terms of Service | Account and Platform Use Terms",
  twitterDescription:
    "Read the Dineros Terms of Service, including eligibility, acceptable use, arbitration terms, class action waiver, and Florida governing law.",
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
      children: JSON.stringify(termsJsonLd),
    } as { type: string; children: string },
  ],
});
</script>

<template lang="pug">
div(class="legal-document" itemscope itemtype="https://schema.org/Article")
  header(class="legal-document__header")
    h1 Terms of Service
    p(class="legal-document__meta")
      span(itemprop="author") Dineros Editorial Team
      |  ·
      time(itemprop="datePublished" datetime="2026-03-14T00:00:00.000Z") Published March 14, 2026
    span(class="legal-document__effective") Effective Date: March 14, 2026

  div(class="legal-document__body")
    section
      h2 1. Introduction and Agreement
      p
        | These Terms of Service ("Terms") are a legal agreement between you and Linear Budgeting LLC, doing business as Dineros.cc ("Dineros," "we," "our," or "us").
      p
        | By creating an account, accessing, or using our website, applications, or related services (collectively, the "Services"), you agree to be bound by these Terms and our Privacy Policy.
      p
        | If you do not agree, do not use the Services.

    section
      h2 2. Eligibility
      p
        | You must be at least 18 years old and legally capable of entering into a binding contract to use the Services.
      p
        | You represent and warrant that all information you provide is accurate, current, and complete.

    section
      h2 3. Account Registration and Security
      ul
        li You are responsible for maintaining the confidentiality of your account credentials.
        li You are responsible for all activity that occurs under your account.
        li You must promptly notify us of unauthorized use or suspected security incidents.
        li We may require identity verification and may suspend accounts that present fraud, abuse, or legal risk.

    section
      h2 4. Financial Data Services and Third-Party Integrations
      p
        | Dineros may provide budgeting, forecasting, register tracking, recurring transaction tools, and related account management features.
      p
        | Some features rely on third-party providers (including Plaid and other infrastructure vendors). Your use of those features may also be subject to third-party terms and privacy policies.
      p
        | Use of Plaid-powered features is also subject to
        a(href="https://plaid.com/legal/" target="_blank" rel="noopener noreferrer")  Plaid legal terms
        |  and
        a(href="https://plaid.com/legal/#privacy-policy" target="_blank" rel="noopener noreferrer")  Plaid's End User Privacy Policy
        | .
      p
        | We are not responsible for third-party outages, errors, service interruptions, or data delays outside our reasonable control.

    section
      h2 5. No Financial, Investment, Tax, or Legal Advice
      p
        | The Services are provided for informational and organizational purposes only. Dineros does not provide financial planning, investment, accounting, tax, or legal advice.
      p
        | Any forecasts, projections, insights, or calculations are estimates, may change, and are not guarantees of future outcomes.

    section
      h2 6. Acceptable Use
      p
        | You agree not to:
      ul
        li Violate any applicable law, regulation, or third-party right.
        li Interfere with, disrupt, or attempt unauthorized access to the Services or related systems.
        li Upload malicious code, scrape data in violation of these Terms, or abuse our APIs/features.
        li Use the Services for fraud, money laundering, or other unlawful activity.

    section
      h2 7. Fees, Billing, and Refunds
      p
        | If paid plans or paid features are offered, pricing and billing terms will be disclosed at the point of purchase.
      p
        | Unless expressly stated otherwise, fees are non-refundable to the maximum extent permitted by law.

    section
      h2 8. Intellectual Property
      p
        | The Services, including software, designs, trademarks, and content provided by Dineros, are owned by or licensed to us and protected by intellectual property laws.
      p
        | Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to use the Services for your personal or internal business purposes.

    section
      h2 9. Suspension and Termination
      p
        | We may suspend or terminate access to the Services, with or without notice, if we reasonably believe you violated these Terms, created legal/security risk, or engaged in misuse.
      p
        | You may stop using the Services at any time.

    section
      h2 10. Disclaimer of Warranties
      p(class="legal-document__all-caps")
        | To the maximum extent permitted by law, the Services are provided "as is" and "as available" without warranties of any kind, express or implied, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
      p
        | We do not warrant uninterrupted access, complete accuracy, or error-free operation.

    section
      h2 11. Limitation of Liability
      p(class="legal-document__all-caps")
        | To the maximum extent permitted by law, Dineros and its officers, directors, employees, and affiliates will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenue, data, or goodwill.
      p(class="legal-document__all-caps")
        | To the maximum extent permitted by law, our total liability for any claims arising out of or related to the Services will not exceed the greater of (a) $100 USD or (b) the amount you paid to Dineros for the Services in the 12 months before the event giving rise to liability.

    section
      h2 12. Indemnification
      p
        | You agree to defend, indemnify, and hold harmless Dineros and its affiliates, officers, directors, employees, and agents from and against claims, liabilities, damages, losses, and expenses (including reasonable attorneys' fees) arising from your use of the Services, your violation of these Terms, or your violation of applicable law or third-party rights.

    section
      h2 13. Dispute Resolution by Binding Arbitration
      p(class="legal-document__all-caps")
        | Please read this section carefully. Except as expressly provided below, you and Dineros agree to resolve disputes through final and binding individual arbitration, not in court.
      p
        | Before filing arbitration, the party bringing a claim must provide written notice and a 30-day opportunity to resolve the dispute informally.
      p
        | If unresolved, arbitration will be conducted by a nationally recognized arbitration provider in English. The arbitrator will have exclusive authority to resolve disputes about arbitrability and interpretation of this arbitration section.
      p
        | Either party may bring individual claims in small claims court if those claims qualify and remain in that court.

    section
      h2 14. Class Action Waiver
      p(class="legal-document__all-caps")
        | To the maximum extent permitted by law, you and Dineros agree that each may bring claims against the other only in an individual capacity, and not as a plaintiff, class member, or representative in any purported class, collective, consolidated, or representative proceeding.
      p
        | Unless both parties agree otherwise in writing, the arbitrator may not consolidate claims of multiple persons or preside over any form of representative or class proceeding.

    section
      h2 15. Arbitration Opt-Out
      p
        | You may opt out of Sections 13 and 14 by sending written notice within 30 days of first accepting these Terms.
      p
        | Your notice must include your full name, account email, mailing address, and a clear statement that you are opting out of the arbitration agreement and class action waiver.
      p
        | Send opt-out notices to:
        a(href="mailto:legal@dineros.cc")  legal@dineros.cc
        |  and
        a(href="https://maps.google.com/?q=5753+Highway+85+North+PMB+3496+Crestview+FL+32536" target="_blank" rel="noopener noreferrer")  5753 Highway 85 North PMB 3496, Crestview, FL 32536
        | .

    section
      h2 16. Copyright and DMCA Notice
      p
        | We respect intellectual property rights and expect users of the Services to do the same. If you believe that content made available through the Services infringes your copyright, you may send a valid Digital Millennium Copyright Act (DMCA) notice and we will respond in accordance with applicable law.
      p
        | DMCA notices should include sufficient detail to identify the copyrighted work, the allegedly infringing material, and your contact information, along with the statements required by 17 U.S.C. section 512(c)(3).
      p
        | Designated DMCA agent:
        a(href="mailto:legal@dineros.cc")  legal@dineros.cc
        | ,
        a(href="https://maps.google.com/?q=5753+Highway+85+North+PMB+3496+Crestview+FL+32536" target="_blank" rel="noopener noreferrer")  5753 Highway 85 North PMB 3496, Crestview, FL 32536
        | .
      p
        | If your content was removed in error, you may submit a counter-notice that complies with 17 U.S.C. section 512(g). We may forward valid counter-notices to the original claimant as permitted by law.

    section
      h2 17. Governing Law
      p
        | These Terms are governed by the laws of the State of Florida, without regard to conflict-of-law principles, except where preempted by federal law (including the Federal Arbitration Act).

    section
      h2 18. Changes to These Terms
      p
        | We may update these Terms from time to time. Updated Terms will be posted on this page with a revised effective date.
      p
        | If changes are material, we may provide additional notice through the Services or by email.

    section(class="legal-document__contact-block")
      h2 19. Contact Information
      p
        | For questions about these Terms, contact us at:
      ul
        li
          | Email:
          a(href="mailto:legal@dineros.cc")  legal@dineros.cc
        li
          | Phone:
          a(href="tel:+16152618201")  615-261-8201
        li
          | Address:
          a(href="https://maps.google.com/?q=5753+Highway+85+North+PMB+3496+Crestview+FL+32536" target="_blank" rel="noopener noreferrer")  5753 Highway 85 North PMB 3496, Crestview, FL 32536
</template>
