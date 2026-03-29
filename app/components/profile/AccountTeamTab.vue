<script setup lang="ts">
import { handleError } from "~/lib/utils";

type InviteAccountRow = {
  account: { id: string; name: string };
  canViewBudgets: boolean;
  canInviteUsers: boolean;
  canManageMembers: boolean;
};

type InviteRow = {
  id: number;
  email: string;
  expiresAt: string;
  createdAt: string;
  inviteAccounts: InviteAccountRow[];
  invitedBy: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
};

type MemberRow = {
  userId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  canViewBudgets: boolean;
  canInviteUsers: boolean;
  canManageMembers: boolean;
  allowedBudgetIds: unknown;
};

const toast = useToast();
const listStore = useListStore();
const authStore = useAuthStore();
const $api = useNuxtApp().$api as typeof $fetch;

const contextAccountId = ref<string>("");
const inviteEmail = ref("");
const inviteError = ref("");
const isSending = ref(false);
const isLoading = ref(true);
const invites = ref<InviteRow[]>([]);
const members = ref<MemberRow[]>([]);
const membersLoading = ref(false);

const inviteAccountIds = ref<string[]>([]);
const permissions = ref({
  canViewBudgets: true,
  canInviteUsers: false,
  canManageMembers: false,
});

const accountOptions = computed(() =>
  listStore.getAccounts.map((a) => ({
    label: a.name,
    value: a.id,
  })),
);

const invitableAccounts = computed(() => {
  return listStore.getAccounts.filter((a) => {
    const m = listStore.membershipForAccount(a.id);
    return m?.canInviteUsers === true;
  });
});

onMounted(async () => {
  if (listStore.getAccounts.length === 0) {
    await listStore.fetchLists();
  }
  if (listStore.getAccounts.length > 0) {
    const first = invitableAccounts.value[0] ?? listStore.getAccounts[0];
    if (first) {
      contextAccountId.value = first.id;
      inviteAccountIds.value = [first.id];
    }
  }
  await loadInvites();
  await loadMembers();
});

watch(contextAccountId, () => {
  void loadInvites();
  void loadMembers();
});

watch(
  invitableAccounts,
  (list) => {
    if (list.length === 0) return;
    if (!list.some((a) => a.id === contextAccountId.value)) {
      contextAccountId.value = list[0]!.id;
    }
  },
  { flush: "post" },
);

function toggleInviteAccount(id: string, checked: boolean) {
  if (checked) {
    if (!inviteAccountIds.value.includes(id)) {
      inviteAccountIds.value = [...inviteAccountIds.value, id];
    }
  } else {
    inviteAccountIds.value = inviteAccountIds.value.filter((x) => x !== id);
  }
}

async function loadInvites() {
  if (!contextAccountId.value) {
    invites.value = [];
    isLoading.value = false;
    return;
  }
  isLoading.value = true;
  try {
    const data = await $api<InviteRow[]>("/api/account-invite", {
      query: { accountId: contextAccountId.value },
    });
    invites.value = data ?? [];
  } catch (e) {
    handleError(e instanceof Error ? e : new Error(String(e)), toast);
  } finally {
    isLoading.value = false;
  }
}

async function loadMembers() {
  if (!contextAccountId.value) {
    members.value = [];
    return;
  }
  const m = listStore.membershipForAccount(contextAccountId.value);
  if (!m?.canInviteUsers) {
    members.value = [];
    return;
  }
  membersLoading.value = true;
  try {
    const data = await $api<MemberRow[]>(
      `/api/account/${encodeURIComponent(contextAccountId.value)}/members`,
    );
    members.value = data ?? [];
  } catch {
    members.value = [];
  } finally {
    membersLoading.value = false;
  }
}

watch(
  () => listStore.memberships,
  () => {
    void loadMembers();
  },
  { deep: true },
);

async function sendInvite() {
  inviteError.value = "";
  if (inviteAccountIds.value.length === 0 || !inviteEmail.value.trim()) {
    inviteError.value =
      "Select at least one account and enter an email address.";
    return;
  }
  isSending.value = true;
  try {
    await $api("/api/account-invite", {
      method: "POST",
      body: {
        accountIds: inviteAccountIds.value,
        email: inviteEmail.value.trim(),
        permissions: {
          canViewBudgets: permissions.value.canViewBudgets,
          canInviteUsers: permissions.value.canInviteUsers,
          canManageMembers: permissions.value.canManageMembers,
          allowedBudgetIds: null,
        },
      },
    });
    toast.add({ color: "success", description: "Invitation sent." });
    inviteEmail.value = "";
    await loadInvites();
  } catch (e) {
    inviteError.value =
      "We could not send the invitation. Check the email and try again.";
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

async function removeMember(userId: number) {
  if (!contextAccountId.value) return;
  if (userId === authStore.user?.id) {
    toast.add({
      color: "error",
      description: "Use account settings to leave, or ask another admin.",
    });
    return;
  }
  try {
    await $api(
      `/api/account/${encodeURIComponent(contextAccountId.value)}/members/${userId}`,
      { method: "DELETE" },
    );
    toast.add({ color: "success", description: "Member removed." });
    await loadMembers();
    await listStore.fetchLists();
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

function inviteTargetNames(row: InviteRow) {
  return row.inviteAccounts.map((x) => x.account.name).join(", ");
}

const canManageMembersForContext = computed(() => {
  if (!contextAccountId.value) return false;
  return (
    listStore.membershipForAccount(contextAccountId.value)
      ?.canManageMembers === true
  );
});
</script>

<template lang="pug">
div
  p(class="text-sm frog-text-muted mb-6 max-w-xl")
    | Invite teammates by email. Choose accounts and what they can do. Pending invites and members are shown for the account you select below.

  UAlert(
    v-if="accountOptions.length === 0"
    class="max-w-xl mx-auto mb-4"
    color="neutral"
    variant="subtle"
    title="No accounts"
    description="You need at least one account before you can send invitations."
  )

  .max-w-xl.mx-auto.space-y-4(v-else)
    ul(v-if="inviteError" class="space-y-2")
      li(role="alert" class="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error")
        | {{ inviteError }}

    UFormField(label="Account for this view" name="contextAccountId")
      select(
        v-model="contextAccountId"
        class="block w-full rounded-md border border-default bg-default px-3 py-2 text-sm"
      )
        option(v-for="opt in accountOptions" :key="opt.value" :value="opt.value") {{ opt.label }}

    p(class="text-xs frog-text-muted") Pending invitations and members below are for this account.

    UFormField(label="Invite to accounts" name="inviteAccounts")
      .space-y-2
        label(
          v-for="a in invitableAccounts"
          :key="a.id"
          class="flex items-center gap-2 text-sm cursor-pointer"
        )
          input(
            type="checkbox"
            :checked="inviteAccountIds.includes(a.id)"
            @change="toggleInviteAccount(a.id, ($event.target as HTMLInputElement).checked)"
          )
          span {{ a.name }}

    p(v-if="invitableAccounts.length === 0" class="text-sm text-warning") You cannot invite users to any account with your current access.

    .space-y-2.border.border-default.rounded-lg.p-3
      p(class="text-xs font-semibold uppercase frog-text-muted") Permissions for this invite
      label(class="flex items-center gap-2 text-sm")
        input(type="checkbox" v-model="permissions.canViewBudgets")
        span View budgets &amp; forecast data
      label(class="flex items-center gap-2 text-sm")
        input(type="checkbox" v-model="permissions.canInviteUsers")
        span Invite other users
      label(class="flex items-center gap-2 text-sm")
        input(type="checkbox" v-model="permissions.canManageMembers")
        span Manage members (remove / change access)

    UFormField(label="Email to invite" name="email")
      UInput(
        v-model="inviteEmail"
        type="email"
        autocomplete="email"
        placeholder="colleague@example.com"
        class="w-full"
        @input="inviteError = ''"
      )

    UButton(
      color="primary"
      :loading="isSending"
      :disabled="isSending || inviteAccountIds.length === 0 || invitableAccounts.length === 0"
      @click="sendInvite"
    ) Send invitation

  .max-w-3xl.mx-auto.mt-10(v-if="contextAccountId")
    h3(class="text-lg font-semibold mb-3") Pending invitations
    div(v-if="invites.length === 0")
      p.frog-text-muted.text-sm No pending invitations.
      p.frog-text-muted.text-xs.mt-1(v-if="isLoading") Loading…
    ul(v-else class="space-y-2")
      li(
        v-for="row in invites"
        :key="row.id"
        class="flex flex-wrap items-center justify-between gap-2 border border-default rounded-lg p-3"
      )
        div(class="min-w-0")
          div(class="font-medium truncate") {{ row.email }}
          div(class="text-xs frog-text-muted mt-1") Accounts: {{ inviteTargetNames(row) }}
          div(class="text-xs frog-text-muted mt-1")
            span Invited by {{ inviterLabel(row) }}
            span  · Expires {{ new Date(row.expiresAt).toLocaleString() }}
        UButton(
          size="xs"
          color="error"
          variant="soft"
          @click="revoke(row.id)"
        ) Revoke

    h3(class="text-lg font-semibold mb-3 mt-10") Members
    p(v-if="membersLoading" class="text-sm frog-text-muted") Loading…
    p(v-else-if="!listStore.membershipForAccount(contextAccountId)?.canInviteUsers" class="text-sm frog-text-muted") You cannot view members for this account.
    div(v-else-if="members.length === 0")
      p.frog-text-muted.text-sm No members found.
    ul(v-else class="space-y-2")
      li(
        v-for="m in members"
        :key="m.userId"
        class="flex flex-wrap items-center justify-between gap-2 border border-default rounded-lg p-3"
      )
        div(class="min-w-0")
          div(class="font-medium truncate") {{ m.email }}
          div(class="text-xs frog-text-muted mt-1")
            | {{ [m.firstName, m.lastName].filter(Boolean).join(' ') || '—' }}
          div(class="text-xs frog-text-muted mt-0.5")
            | View budgets: {{ m.canViewBudgets ? 'yes' : 'no' }} · Invite: {{ m.canInviteUsers ? 'yes' : 'no' }} · Manage: {{ m.canManageMembers ? 'yes' : 'no' }}
        UButton(
          v-if="canManageMembersForContext && m.userId !== authStore.user?.id"
          size="xs"
          color="error"
          variant="soft"
          @click="removeMember(m.userId)"
        ) Remove
</template>
