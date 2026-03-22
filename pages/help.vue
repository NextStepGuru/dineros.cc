<script setup lang="ts">
definePageMeta({
  middleware: "auth",
});

useHead({
  title: "Help | Dineros",
  meta: [
    {
      name: "description",
      content:
        "How to use Dineros: budgets, goals, accounts, recurring items, register, recalc, Plaid sync, shortcuts, and troubleshooting.",
    },
    { name: "robots", content: "noindex, nofollow" },
  ],
});
</script>

<template lang="pug">
section(class="mx-auto max-w-3xl px-4 py-10 space-y-10 pb-20")
  header(class="space-y-2")
    h1(class="text-3xl font-bold frog-text") Help
    p(class="frog-text-muted text-base leading-relaxed")
      | Dineros helps you see projected balances before money moves. This page walks through setup, day-to-day use, and where to get support.

  UCard(id="recent-updates")
    template(#header)
      h2(class="text-lg font-semibold") What’s new
    div(class="space-y-3 text-sm leading-relaxed frog-text-muted")
      p(class="text-sm")
        | Recent product updates (spring 2026) — jump to a section for detail:
      ul(class="list-disc pl-5 space-y-1.5")
        li
          NuxtLink(to="#budgets" class="frog-link") Budgets
          span &nbsp;— multiple budgets, optional new financial workspace when creating, reset from default, archive.
        li
          NuxtLink(to="#goals" class="frog-link") Savings goals
          span &nbsp;— targets, source/target accounts, forecast integration, optional category, archive.
        li
          NuxtLink(to="#projected-balance" class="frog-link") Projected balance
          span &nbsp;— end-of-month slider on Accounts plus optional timeline chart.
        li
          NuxtLink(to="#reports" class="frog-link") Category reports
          span &nbsp;— past vs future, filters, register scope.
        li
          NuxtLink(to="#recurring" class="frog-link") Recurring
          span &nbsp;— category on the rule, splits (fixed or percent of amount), amount adjustments.
        li
          NuxtLink(to="#loan-asset-settings" class="frog-link") Loans &amp; assets
          span &nbsp;— payment/interest categories, depreciation and appreciation on eligible asset types.

  nav(class="flex flex-wrap gap-2 text-sm")
    NuxtLink(to="#budgets" class="inline-flex")
      UButton(size="xs" variant="soft") Budgets
    UButton(to="/account-registers" size="xs" variant="soft") Accounts
    UButton(to="/reoccurrences" size="xs" variant="soft") Recurring
    UButton(to="/goals" size="xs" variant="soft") Goals
    UButton(to="/reports" size="xs" variant="soft") Reports
    UButton(to="/edit-profile/profile" size="xs" variant="soft") Profile
    UButton(to="/edit-profile/sync-accounts" size="xs" variant="soft") Sync accounts
    UButton(to="/contact" size="xs" variant="outline") Contact support

  UCard(id="first-time")
    template(#header)
      h2(class="text-lg font-semibold") First-time setup
    div(class="space-y-4 text-sm leading-relaxed frog-text-muted")
      p
        | Use the budget menu in the header to pick which budget you’re working in when you have more than one. When you first open a register with no entries, you’ll see a short checklist. In order, you’ll want to:
      ol(class="list-decimal pl-5 space-y-2")
        li
          strong(class="frog-text") Accounts
          span &nbsp;— create or edit account registers and set realistic opening balances.
        li
          strong(class="frog-text") Recurring
          span &nbsp;— add repeating inflows (paychecks) and outflows (rent, subscriptions, utilities, loans, insurance).
        li
          strong(class="frog-text") Recalc
          span &nbsp;— generates projected register rows from those rules. Forecasts are estimates, not guarantees.
        li
          strong(class="frog-text") Optional: Sync
          span &nbsp;— link banks via Plaid under Profile → Sync accounts to reduce manual balance updates.
      p
        span You can skip the checklist anytime; use&nbsp;
        strong(class="frog-text") Add
        span &nbsp;to enter an opening balance or transaction manually.

  UCard(id="budgets")
    template(#header)
      h2(class="text-lg font-semibold") Budgets
    div(class="space-y-3 text-sm leading-relaxed frog-text-muted")
      p
        | Open the budget menu in the header to switch budgets, create a new one, rename, reset from your default, or delete (archive) a budget.
      ul(class="list-disc pl-5 space-y-2")
        li
          strong(class="frog-text") Create
          span &nbsp;— new budgets copy registers and data from your default budget. You can optionally check&nbsp;
          strong(class="frog-text") Create new financial account (copy categories and migrate references)
          span &nbsp;to use a separate account workspace; your default budget stays unchanged.
        li
          strong(class="frog-text") Reset from default
          span &nbsp;— replaces everything in the selected budget with a fresh copy from the default. This cannot be undone.
        li
          strong(class="frog-text") Delete
          span &nbsp;— archives that budget and its accounts. The default budget cannot be deleted.

  UCard(id="goals")
    template(#header)
      h2(class="text-lg font-semibold") Savings goals
    div(class="space-y-3 text-sm leading-relaxed frog-text-muted")
      p
        span The&nbsp;
        NuxtLink(to="/goals" class="frog-link") Goals
        span &nbsp;page lists savings goals that pull from a source account toward a target (often a pocket). Goals participate in forecasting according to your settings.
      ul(class="list-disc pl-5 space-y-2")
        li
          strong(class="frog-text") Category
          span &nbsp;— optional; ties the goal to a category from the same account for organization and reporting. Categories are scoped to the account’s category list.
        li
          strong(class="frog-text") Priority over debt / Ignore min balance
          span &nbsp;— control how aggressively the forecast funds the goal versus other rules.
        li
          strong(class="frog-text") Archive
          span &nbsp;— removes the goal from active use; you can add new goals anytime.

  UCard(id="accounts")
    template(#header)
      h2(class="text-lg font-semibold") Accounts (registers)
    div(class="space-y-3 text-sm leading-relaxed frog-text-muted")
      p
        span Each row is an&nbsp;
        strong(class="frog-text") account register
        span &nbsp;— a bucket you forecast against (checking, credit card, savings, etc.). Tap a name to edit type, balance, loan fields, and more.
      ul(class="list-disc pl-5 space-y-2")
        li
          strong(class="frog-text") Pocket / sub-accounts
          span &nbsp;— some parent accounts can hold linked “pocket” rows; expand the chevron to see them. You can reorder rows by drag (desktop) or long-press and move (mobile).
        li
          strong(class="frog-text") Sort modes
          span &nbsp;— switch between visual order, loan payment order, or savings goal order when reordering.
        li
          strong(class="frog-text") Net worth line
          span &nbsp;— the total excludes certain internal types; use it as a quick snapshot, not tax advice.
        li
          strong(class="frog-text") Archive
          span &nbsp;— from the account edit dialog you can archive a register so it no longer appears in lists or dropdowns.

  UCard(id="projected-balance")
    template(#header)
      h2(class="text-lg font-semibold") Projected balance (Accounts)
    div(class="space-y-3 text-sm leading-relaxed frog-text-muted")
      p
        span On the Accounts page, use the&nbsp;
        strong(class="frog-text") Projected balance timeline
        span &nbsp;toggle to show an end-of-month projection strip. The slider moves from&nbsp;
        strong(class="frog-text") Current (live)
        span &nbsp;through future months (up to 24) so you can compare balances after forecast rules run.
      p(class="text-xs border-l-2 border-default pl-3")
        | Snapshot mode hides this control; projections load from the server for your selected budget and account.

  UCard(id="loan-asset-settings")
    template(#header)
      h2(class="text-lg font-semibold") Loans, interest, and asset registers
    div(class="space-y-3 text-sm leading-relaxed frog-text-muted")
      p
        | When you edit a credit, loan, savings, or other supported type, additional fields appear (APR or interest rate, statement timing, minimum payments, loan payment source account, etc.).
      ul(class="list-disc pl-5 space-y-2")
        li
          strong(class="frog-text") Payment &amp; interest categories
          span &nbsp;— on eligible types you can assign categories for generated payment vs interest portions so reports stay accurate.
        li
          strong(class="frog-text") Balance growth
          span &nbsp;— some non-credit asset types accrue growth over time using the annual growth / return fields in the editor.
        li
          strong(class="frog-text") Vehicle &amp; collectable assets
          span &nbsp;— vehicle-type registers support depreciation (rate and method, start date). Collectable vehicle types use appreciation fields instead. Forecast entries reflect those settings after Recalc.

  UCard(id="recurring")
    template(#header)
      h2(class="text-lg font-semibold") Recurring (reoccurrences)
    div(class="space-y-3 text-sm leading-relaxed frog-text-muted")
      p
        span Recurring items drive most of your&nbsp;
        strong(class="frog-text") projected
        span &nbsp;register entries after Recalc. Examples:
      ul(class="list-disc pl-5 space-y-1")
        li Paychecks and freelance deposits
        li Rent, mortgage, HOA
        li Subscriptions (streaming, software, gym)
        li Utilities, phone, internet
        li Loan and credit card minimums (plus extra payments if you model them)
        li Insurance (auto, health premiums)
      p
        span Pick the&nbsp;
        strong(class="frog-text") account register
        span &nbsp;each item hits, the&nbsp;
        strong(class="frog-text") interval
        span &nbsp;(e.g. monthly), amount, and last-run date. Set an optional&nbsp;
        strong(class="frog-text") Category
        span &nbsp;so generated entries tag consistently in reports.
      p
        strong(class="frog-text") Amount adjustment
        span &nbsp;(optional) can increase or decrease the occurrence over time by a fixed amount or percent on a schedule you choose—useful for stepped rent or changing subscriptions.
      p
        strong(class="frog-text") Split transfers
        span &nbsp;let you route pieces of one occurrence to other registers. Each split can be a&nbsp;
        strong(class="frog-text") fixed dollar
        span &nbsp;amount or a&nbsp;
        strong(class="frog-text") percent
        span &nbsp;of the occurrence amount (after any amount adjustment). Per-split categories and labels keep reporting clear.
      p
        span Use&nbsp;
        strong(class="frog-text") Recalc
        span &nbsp;on the Recurring page or Register to refresh projections.

  UCard(id="register")
    template(#header)
      h2(class="text-lg font-semibold") Register
    div(class="space-y-3 text-sm leading-relaxed frog-text-muted")
      ul(class="list-disc pl-5 space-y-2")
        li
          strong(class="frog-text") Future / Past
          span &nbsp;— Future shows upcoming and projected activity; Past shows history-style ordering for review.
        li
          strong(class="frog-text") Refresh
          span &nbsp;— reloads entries from the server without changing forecast rules.
        li
          strong(class="frog-text") Recalc
          span &nbsp;— rebuilds projected rows from recurring rules and your current setup for that account’s institution.
        li
          strong(class="frog-text") Filter &amp; category
          span &nbsp;— narrow rows by text; use the combined category control where available to filter by category and subcategories.
        li
          strong(class="frog-text") Lowest balance / payoff hints
          span &nbsp;— when available, links help you jump to important dates in the table.
      p(class="text-xs border-l-2 border-default pl-3")
        | Projected lines are generated for planning. Always verify against real bank activity, especially before large decisions.

  UCard(id="reports")
    template(#header)
      h2(class="text-lg font-semibold") Category reports
    div(class="space-y-3 text-sm leading-relaxed frog-text-muted")
      p
        span Under&nbsp;
        NuxtLink(to="/reports" class="frog-link") Reports
        span , choose&nbsp;
        strong(class="frog-text") Past
        span &nbsp;for historical totals or&nbsp;
        strong(class="frog-text") Future / forecast
        span &nbsp;for projected activity. Set the date range, optionally scope to one register, include or exclude transfers, and choose whether subcategories roll up or show separately.

  UCard(id="export")
    template(#header)
      h2(class="text-lg font-semibold") Saving or printing your register
    p(class="text-sm frog-text-muted leading-relaxed")
      | After Recalc, use your browser’s print flow (
      kbd(class="px-1 rounded bg-elevated text-xs") ⌘P
      | &nbsp;on Mac,
      kbd(class="px-1 rounded bg-elevated text-xs") Ctrl+P
      | &nbsp;on Windows) and choose&nbsp;
      strong(class="frog-text") Save as PDF
      span &nbsp;to keep a snapshot of what you see on screen.

  UCard(id="sync")
    template(#header)
      h2(class="text-lg font-semibold") Bank sync (Plaid)
    div(class="space-y-3 text-sm leading-relaxed frog-text-muted")
      p
        span Under&nbsp;
        NuxtLink(to="/edit-profile/sync-accounts" class="frog-link") Profile → Sync accounts
        span , you can link institutions so balances can stay closer to reality. Sync is optional; you can run entirely manual registers.
      p
        | Connection health, item login refresh, and which accounts you map are all managed from that screen.

  UCard(id="profile")
    template(#header)
      h2(class="text-lg font-semibold") Profile & security
    ul(class="list-disc pl-5 space-y-2 text-sm frog-text-muted leading-relaxed")
      li
        NuxtLink(to="/edit-profile/profile" class="frog-link") Profile
        span &nbsp;— name and preferences.
      li
        NuxtLink(to="/edit-profile/password" class="frog-link") Password
        span &nbsp;— change sign-in password.
      li
        NuxtLink(to="/edit-profile/two-factor-auth" class="frog-link") Two-factor
        span &nbsp;— add an extra layer on your account when enabled.
      li Privacy and terms are linked from the site footer when you need the legal details.

  UCard(id="troubleshooting")
    template(#header)
      h2(class="text-lg font-semibold") Troubleshooting
    ul(class="space-y-3 text-sm frog-text-muted leading-relaxed")
      li
        strong(class="frog-text") Register looks empty after setup
        span &nbsp;— run&nbsp;
        strong(class="frog-text") Recalc
        span ; confirm recurring items target the correct account register and have sensible dates.
      li
        strong(class="frog-text") Balances don’t match my bank
        span &nbsp;— projected rows are forward-looking; compare to cleared/historical entries and Plaid sync if you use it. Adjust opening balance or recurring amounts as needed.
      li
        strong(class="frog-text") Wrong account selected
        span &nbsp;— use the register account dropdown (when visible) or open Accounts and jump into the register you need.
      li
        strong(class="frog-text") Session expired
        span &nbsp;— sign in again; unsaved work in open modals may be lost, so save important edits first.

  UCard(id="shortcuts")
    template(#header)
      h2(class="text-lg font-semibold") Keyboard shortcuts
    p(class="text-sm frog-text-muted mb-4")
      span On Register, Accounts, and Recurring, use the&nbsp;
      strong(class="frog-text") Shortcuts
      span &nbsp;button for the exact keys on your device.&nbsp;
      strong(class="frog-text") ⌘
      span &nbsp;below means the primary meta key (Command on Mac, Windows key on many PCs).

    div(class="overflow-x-auto")
      table(class="w-full text-sm border-collapse")
        thead
          tr(class="border-b frog-border text-left")
            th(class="py-2 pr-4 font-semibold frog-text") Action
            th(class="py-2 font-semibold frog-text") Keys
        tbody(class="frog-text-muted divide-y divide-default")
          tr
            td(class="py-2 pr-4") Clear filter
            td(class="py-2")
              kbd(class="px-1.5 py-0.5 rounded bg-elevated text-xs") Esc
          tr
            td(class="py-2 pr-4") Add (entry / account / recurrence)
            td(class="py-2")
              kbd(class="px-1.5 py-0.5 rounded bg-elevated text-xs") ⌘
              | &nbsp;+
              kbd(class="px-1.5 py-0.5 rounded bg-elevated text-xs") A
              span(class="text-xs ml-2 block mt-1") Modifier key matches Shortcuts on each page (often ⌘ on Mac, ⊞ on Windows).
          tr
            td(class="py-2 pr-4") Focus search / filter
            td(class="py-2")
              kbd(class="px-1.5 py-0.5 rounded bg-elevated text-xs") ⌘
              | &nbsp;+
              kbd(class="px-1.5 py-0.5 rounded bg-elevated text-xs") F
          tr
            td(class="py-2 pr-4") Refresh register
            td(class="py-2")
              kbd(class="px-1.5 py-0.5 rounded bg-elevated text-xs") ⌘
              | &nbsp;+
              kbd(class="px-1.5 py-0.5 rounded bg-elevated text-xs") R
              span(class="text-xs ml-2") Register only
          tr
            td(class="py-2 pr-4") Recalc forecast
            td(class="py-2")
              kbd(class="px-1.5 py-0.5 rounded bg-elevated text-xs") ⌘
              | &nbsp;+
              kbd(class="px-1.5 py-0.5 rounded bg-elevated text-xs") Shift
              | &nbsp;+
              kbd(class="px-1.5 py-0.5 rounded bg-elevated text-xs") R
              span(class="text-xs ml-2") Register only

  footer(class="flex flex-wrap gap-3 pt-4 border-t frog-border")
    UButton(to="/contact" color="primary" size="sm") Contact support
</template>
