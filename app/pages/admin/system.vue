<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "admin"],
});

const config = useRuntimeConfig();
const $api = useNuxtApp().$api as typeof $fetch;
const toast = useToast();

const loading = ref(true);
const status = ref<{
  app: {
    deployEnv: string | null;
    nodeEnv: string | null;
    buildId: string | null;
  };
  checks: { database: boolean; redis: boolean };
  links: {
    bullBoardUrl: string | null;
    postmarkActivityBaseUrl: string | null;
    externalLoggingUrl: string | null;
    runbookUrl: string | null;
  };
} | null>(null);

const postmarkRecipient = ref("");
const postmarkLoading = ref(false);
const postmarkRows = ref<
  {
    messageId: string;
    to: string;
    subject: string;
    status: string;
    receivedAt: string;
    tag: string;
  }[]
>([]);

onMounted(async () => {
  loading.value = true;
  try {
    status.value = await $api("/api/admin/system-status");
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to load status.";
    toast.add({ color: "error", description: message });
  } finally {
    loading.value = false;
  }
});

const bullLink = computed(
  () => status.value?.links.bullBoardUrl || config.public.bullBoardUrl || "",
);

const postmarkActivityLink = computed(
  () =>
    status.value?.links.postmarkActivityBaseUrl ||
    config.public.postmarkActivityBaseUrl ||
    "",
);

const externalLoggingLink = computed(
  () =>
    status.value?.links.externalLoggingUrl ||
    config.public.externalLoggingUrl ||
    "",
);

const runbookLink = computed(
  () => status.value?.links.runbookUrl || config.public.runbookUrl || "",
);

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

async function searchPostmark() {
  const r = postmarkRecipient.value.trim();
  if (!r) {
    toast.add({
      color: "error",
      description: "Enter a recipient email.",
    });
    return;
  }
  postmarkLoading.value = true;
  postmarkRows.value = [];
  try {
    const res = await $api<{
      totalCount: number;
      messages: typeof postmarkRows.value;
    }>("/api/admin/postmark/messages", {
      query: { recipient: r, count: 20 },
    });
    postmarkRows.value = res.messages;
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Postmark lookup failed.";
    toast.add({ color: "error", description: message });
  } finally {
    postmarkLoading.value = false;
  }
}

useHead({
  title: "Admin system status",
  meta: [
    {
      name: "description",
      content: "Health checks and operational links.",
    },
  ],
});
</script>

<template lang="pug">
AdminPageShell(
  title="System status"
  description="Database and Redis checks, deploy metadata, optional Bull Board, Postmark, and ops links.")
  div(class="space-y-4")
    div(v-if="loading" class="text-sm frog-text-muted") Loading…

    template(v-else-if="status")
      UCard
        template(#header)
          h2(class="text-base font-semibold") Application
        ul(class="text-sm space-y-1 frog-text-muted")
          li Deploy: {{ status.app.deployEnv ?? "—" }}
          li Node: {{ status.app.nodeEnv ?? "—" }}
          li Build / commit: {{ status.app.buildId ?? "—" }}

      UCard
        template(#header)
          h2(class="text-base font-semibold") Checks
        ul(class="text-sm space-y-2")
          li(class="flex items-center gap-2")
            UBadge(:color="status.checks.database ? 'success' : 'error'" variant="subtle") Database
            span {{ status.checks.database ? "OK" : "Failed" }}
          li(class="flex items-center gap-2")
            UBadge(:color="status.checks.redis ? 'success' : 'error'" variant="subtle") Redis
            span {{ status.checks.redis ? "OK" : "Failed" }}

      UCard(v-if="bullLink")
        template(#header)
          h2(class="text-base font-semibold") Queues
        p(class="text-sm frog-text-muted mb-3")
          | Open Bull Board (or your microservice queue UI) in a new tab.
        UButton(
          color="primary"
          variant="soft"
          icon="i-lucide-external-link"
          @click="openExternal(bullLink)") Open queue dashboard

      UAlert(
        v-else
        color="neutral"
        variant="soft"
        title="Queue dashboard URL not configured"
        description="Set NUXT_PUBLIC_BULL_BOARD_URL to your Bull Board base URL (e.g. microservice /bull).")

      UCard
        template(#header)
          h2(class="text-base font-semibold") Email (Postmark)
        p(class="text-sm frog-text-muted mb-3")
          | Search outbound messages by recipient (server token required). Optional: open Postmark Activity in the browser.
        div(class="flex flex-wrap items-end gap-2 mb-4")
          UFormField(label="Recipient email")
            UInput(v-model="postmarkRecipient" type="email" class="min-w-[240px]")
          UButton(
            color="primary"
            :loading="postmarkLoading"
            @click="searchPostmark") Search messages
        UButton(
          v-if="postmarkActivityLink"
          variant="soft"
          icon="i-lucide-external-link"
          @click="openExternal(postmarkActivityLink)") Open Postmark activity
        div(v-if="postmarkRows.length > 0" class="mt-4 overflow-x-auto rounded-lg border border-default")
          table(class="w-full text-sm")
            thead(class="bg-elevated")
              tr
                th(class="p-2 text-left") Received
                th(class="p-2 text-left") To
                th(class="p-2 text-left") Subject
                th(class="p-2 text-left") Status
                th(class="p-2 text-left") Message ID
            tbody
              tr(
                v-for="(m, i) in postmarkRows"
                :key="m.messageId + String(i)"
                class="border-t border-default")
                td(class="p-2 whitespace-nowrap") {{ m.receivedAt ? new Date(m.receivedAt).toLocaleString() : "—" }}
                td(class="p-2") {{ m.to }}
                td(class="p-2 max-w-xs break-words") {{ m.subject }}
                td(class="p-2") {{ m.status }}
                td(class="p-2 font-mono text-xs break-all") {{ m.messageId }}

      UCard
        template(#header)
          h2(class="text-base font-semibold") Operations
        div(class="flex flex-wrap gap-2")
          UButton(
            v-if="externalLoggingLink"
            variant="soft"
            icon="i-lucide-external-link"
            @click="openExternal(externalLoggingLink)") External logs
          UButton(
            v-if="runbookLink"
            variant="soft"
            icon="i-lucide-book-open"
            @click="openExternal(runbookLink)") Runbook
        p(v-if="!externalLoggingLink && !runbookLink" class="text-sm frog-text-muted")
          | Set NUXT_PUBLIC_EXTERNAL_LOGGING_URL and/or NUXT_PUBLIC_RUNBOOK_URL for quick links.

    UAlert(
      color="neutral"
      variant="soft"
      title="Note"
      description="This page does not expose secrets. Postmark search uses the server token only on the API route.")
</template>
