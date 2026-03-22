<script setup lang="ts">
import { handleError } from "~/lib/utils";

type InviteRow = {
  id: number;
  email: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
};

const toast = useToast();
const listStore = useListStore();
const $api = useNuxtApp().$api as typeof $fetch;

const accountId = ref<string>("");
const inviteEmail = ref("");
const isSending = ref(false);
const isLoading = ref(true);
const invites = ref<InviteRow[]>([]);

const accountOptions = computed(() =>
  listStore.getAccounts.map((a) => ({
    label: a.name,
    value: a.id,
  })),
);

onMounted(async () => {
  if (listStore.getAccounts.length === 0) {
    await listStore.fetchLists();
  }
  if (listStore.getAccounts.length > 0) {
    accountId.value = listStore.getAccounts[0]!.id;
  }
  await loadInvites();
});

watch(accountId, () => {
  void loadInvites();
});

async function loadInvites() {
  if (!accountId.value) {
    invites.value = [];
    isLoading.value = false;
    return;
  }
  isLoading.value = true;
  try {
    const data = await $api<InviteRow[]>("/api/account-invite", {
      query: { accountId: accountId.value },
    });
    invites.value = data ?? [];
  } catch (e) {
    handleError(e instanceof Error ? e : new Error(String(e)), toast);
  } finally {
    isLoading.value = false;
  }
}

async function sendInvite() {
  if (!accountId.value || !inviteEmail.value.trim()) {
    toast.add({
      color: "error",
      description: "Choose an account and enter an email address.",
    });
    return;
  }
  isSending.value = true;
  try {
    await $api("/api/account-invite", {
      method: "POST",
      body: { accountId: accountId.value, email: inviteEmail.value.trim() },
    });
    toast.add({ color: "success", description: "Invitation sent." });
    inviteEmail.value = "";
    await loadInvites();
  } catch (e) {
    handleError(e instanceof Error ? e : new Error(String(e)), toast);
  } finally {
    isSending.value = false;
  }
}

async function revoke(id: number) {
  try {
    await $api(`/api/account-invite/${id}`, { method: "DELETE" });
    toast.add({ color: "success", description: "Invite revoked." });
    await loadInvites();
  } catch (e) {
    handleError(e instanceof Error ? e : new Error(String(e)), toast);
  }
}

function inviterLabel(row: InviteRow) {
  const n = [row.invitedBy.firstName, row.invitedBy.lastName]
    .filter(Boolean)
    .join(" ");
  return n || row.invitedBy.email || "—";
}
</script>

<template lang="pug">
div.p-4
  h2(class="text-xl font-bold text-center mb-2") Team & invitations
  p(class="text-sm text-center frog-text-muted mb-6 max-w-xl mx-auto")
    | Invite someone by email. They will have full access to the selected account after they accept.

  UAlert(
    v-if="accountOptions.length === 0"
    class="max-w-xl mx-auto mb-4"
    color="neutral"
    variant="subtle"
    title="No accounts"
    description="You need at least one account before you can send invitations."
  )

  .max-w-xl.mx-auto.space-y-4(v-else)
    UFormField(label="Account" name="accountId")
      USelect(
        v-model="accountId"
        :items="accountOptions"
        value-key="value"
        label-key="label"
        placeholder="Select account"
        class="w-full"
      )

    UFormField(label="Email to invite" name="email")
      UInput(
        v-model="inviteEmail"
        type="email"
        autocomplete="email"
        placeholder="colleague@example.com"
        class="w-full"
      )

    UButton(
      color="primary"
      :loading="isSending"
      :disabled="isSending || !accountId"
      @click="sendInvite"
    ) Send invitation

  .max-w-3xl.mx-auto.mt-10(v-if="accountId")
    h3(class="text-lg font-semibold mb-3") Pending invitations
    div(v-if="isLoading")
      p.frog-text-muted.text-sm Loading…
    div(v-else-if="invites.length === 0")
      p.frog-text-muted.text-sm No pending invitations.
    ul(v-else class="space-y-2")
      li(
        v-for="row in invites"
        :key="row.id"
        class="flex flex-wrap items-center justify-between gap-2 border border-default rounded-lg p-3"
      )
        div(class="min-w-0")
          div(class="font-medium truncate") {{ row.email }}
          div(class="text-xs frog-text-muted mt-1")
            span Invited by {{ inviterLabel(row) }}
            span  · Expires {{ new Date(row.expiresAt).toLocaleString() }}
        UButton(
          size="xs"
          color="error"
          variant="soft"
          @click="revoke(row.id)"
        ) Revoke
</template>
