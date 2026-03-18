<script setup lang="ts">
useHead({
  title: "Help | Dineros",
  meta: [
    {
      name: "description",
      content:
        "How to use Dineros: accounts, recurring items, register, recalc, Plaid sync, shortcuts, and troubleshooting.",
    },
  ],
});
</script>

<template lang="pug">
section(class="mx-auto max-w-3xl px-4 py-10 space-y-10 pb-20")
  header(class="space-y-2")
    h1(class="text-3xl font-bold frog-text") Help
    p(class="frog-text-muted text-base leading-relaxed")
      | Dineros helps you see projected balances before money moves. This page walks through setup, day-to-day use, and where to get support.

  //- Quick links (logged-in routes)
  nav(class="flex flex-wrap gap-2 text-sm")
    UButton(to="/account-registers" size="xs" variant="soft") Accounts
    UButton(to="/reoccurrences" size="xs" variant="soft") Recurring
    UButton(to="/edit-profile/profile" size="xs" variant="soft") Profile
    UButton(to="/edit-profile/sync-accounts" size="xs" variant="soft") Sync accounts
    UButton(to="/contact" size="xs" variant="outline") Contact support

  UCard(id="first-time")
    template(#header)
      h2(class="text-lg font-semibold") First-time setup
    div(class="space-y-4 text-sm leading-relaxed frog-text-muted")
      p
        | When you first open a register with no entries, you’ll see a short checklist. In order, you’ll want to:
      ol(class="list-decimal pl-5 space-y-2")
        li
          strong(class="frog-text") Accounts —
          | create or edit account registers and set realistic opening balances.
        li
          strong(class="frog-text") Recurring —
          | add repeating inflows (paychecks) and outflows (rent, subscriptions, utilities, loans, insurance).
        li
          strong(class="frog-text") Recalc —
          | generates projected register rows from those rules. Forecasts are estimates, not guarantees.
        li
          strong(class="frog-text") Optional: Sync —
          | link banks via Plaid under Profile → Sync accounts to reduce manual balance updates.
      p
        | You can skip the checklist anytime; use
        strong &nbsp;Add
        | &nbsp;to enter an opening balance or transaction manually.

  UCard(id="accounts")
    template(#header)
      h2(class="text-lg font-semibold") Accounts (registers)
    div(class="space-y-3 text-sm leading-relaxed frog-text-muted")
      p
        | Each row is an
        strong(class="frog-text") account register
        | — a bucket you forecast against (checking, credit card, savings, etc.). Tap a name to edit type, balance, loan fields, and more.
      ul(class="list-disc pl-5 space-y-2")
        li
          strong(class="frog-text") Pocket / sub-accounts —
          | some parent accounts can hold linked “pocket” rows; expand the chevron to see them. You can reorder rows by drag (desktop) or long-press and move (mobile).
        li
          strong(class="frog-text") Sort modes —
          | switch between visual order, loan payment order, or savings goal order when reordering.
        li
          strong(class="frog-text") Net worth line —
          | the total excludes certain internal types; use it as a quick snapshot, not tax advice.

  UCard(id="recurring")
    template(#header)
      h2(class="text-lg font-semibold") Recurring (reoccurrences)
    div(class="space-y-3 text-sm leading-relaxed frog-text-muted")
      p
        | Recurring items drive most of your
        strong(class="frog-text") projected
        | register entries after Recalc. Examples:
      ul(class="list-disc pl-5 space-y-1")
        li Paychecks and freelance deposits
        li Rent, mortgage, HOA
        li Subscriptions (streaming, software, gym)
        li Utilities, phone, internet
        li Loan and credit card minimums (plus extra payments if you model them)
        li Insurance (auto, health premiums)
      p
        | Pick the
        strong(class="frog-text") account register
        | each item hits, the
        strong(class="frog-text") interval
        | (e.g. monthly), amount, and last-run date. Use
        strong(class="frog-text") Recalc
        | on the Recurring page or Register to refresh projections.

  UCard(id="register")
    template(#header)
      h2(class="text-lg font-semibold") Register
    div(class="space-y-3 text-sm leading-relaxed frog-text-muted")
      ul(class="list-disc pl-5 space-y-2")
        li
          strong(class="frog-text") Future / Past —
          | Future shows upcoming and projected activity; Past shows history-style ordering for review.
        li
          strong(class="frog-text") Refresh —
          | reloads entries from the server without changing forecast rules.
        li
          strong(class="frog-text") Recalc —
          | rebuilds projected rows from recurring rules and your current setup for that account’s institution.
        li
          strong(class="frog-text") Filter —
          | narrows visible rows by text; clear with Esc when focus allows.
        li
          strong(class="frog-text") Lowest balance / payoff hints —
          | when available, links help you jump to important dates in the table.
      p(class="text-xs border-l-2 border-default pl-3")
        | Projected lines are generated for planning. Always verify against real bank activity, especially before large decisions.

  UCard(id="export")
    template(#header)
      h2(class="text-lg font-semibold") Saving or printing your register
    p(class="text-sm frog-text-muted leading-relaxed")
      | After Recalc, use your browser’s print flow (
      kbd(class="px-1 rounded bg-elevated text-xs") ⌘P
      | &nbsp;on Mac,
      kbd(class="px-1 rounded bg-elevated text-xs") Ctrl+P
      | &nbsp;on Windows) and choose
      strong(class="frog-text") Save as PDF
      | to keep a snapshot of what you see on screen.

  UCard(id="sync")
    template(#header)
      h2(class="text-lg font-semibold") Bank sync (Plaid)
    div(class="space-y-3 text-sm leading-relaxed frog-text-muted")
      p
        | Under
        NuxtLink(to="/edit-profile/sync-accounts" class="frog-link") Profile → Sync accounts
        | , you can link institutions so balances can stay closer to reality. Sync is optional; you can run entirely manual registers.
      p
        | Connection health, item login refresh, and which accounts you map are all managed from that screen.

  UCard(id="profile")
    template(#header)
      h2(class="text-lg font-semibold") Profile & security
    ul(class="list-disc pl-5 space-y-2 text-sm frog-text-muted leading-relaxed")
      li
        NuxtLink(to="/edit-profile/profile" class="frog-link") Profile
        | — name and preferences.
      li
        NuxtLink(to="/edit-profile/password" class="frog-link") Password
        | — change sign-in password.
      li
        NuxtLink(to="/edit-profile/two-factor-auth" class="frog-link") Two-factor
        | — add an extra layer on your account when enabled.
      li Privacy and terms are linked from the site footer when you need the legal details.

  UCard(id="troubleshooting")
    template(#header)
      h2(class="text-lg font-semibold") Troubleshooting
    ul(class="space-y-3 text-sm frog-text-muted leading-relaxed")
      li
        strong(class="frog-text") Register looks empty after setup —
        | run
        strong &nbsp;Recalc
        | ; confirm recurring items target the correct account register and have sensible dates.
      li
        strong(class="frog-text") Balances don’t match my bank —
        | projected rows are forward-looking; compare to cleared/historical entries and Plaid sync if you use it. Adjust opening balance or recurring amounts as needed.
      li
        strong(class="frog-text") Wrong account selected —
        | use the register account dropdown (when visible) or open Accounts and jump into the register you need.
      li
        strong(class="frog-text") Session expired —
        | sign in again; unsaved work in open modals may be lost, so save important edits first.

  UCard(id="shortcuts")
    template(#header)
      h2(class="text-lg font-semibold") Keyboard shortcuts
    p(class="text-sm frog-text-muted mb-4")
      | On Register, Accounts, and Recurring, use the
      strong &nbsp;Shortcuts
      | &nbsp;button for the exact keys on your device.
      strong &nbsp;⌘
      | &nbsp;below means the primary meta key (Command on Mac, Windows key on many PCs).

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
