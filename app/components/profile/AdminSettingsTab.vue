<script setup lang="ts">
const toast = useToast();
const authStore = useAuthStore();

if (authStore.getUser?.role !== "ADMIN") {
  throw createError({
    statusCode: 403,
    statusMessage: "Access Denied",
  });
}

const isRunning = ref(false);
const runningTask = ref("");

// Admin tasks available
const adminTasks: {
  label: string;
  value: string;
  description: string;
  color: "primary" | "secondary" | "success" | "info" | "warning" | "error";
  icon: string;
}[] = [
  {
    label: "Backup",
    value: "backup",
    description: "Create a backup of the database",
    color: "primary",
    icon: "lucide:database",
  },
  {
    label: "Migrate",
    value: "migrate",
    description: "Run database migrations",
    color: "secondary",
    icon: "lucide:arrow-right-left",
  },
  {
    label: "Sync All",
    value: "sync-all",
    description: "Sync all user accounts and data",
    color: "success",
    icon: "lucide:refresh-cw",
  },
  {
    label: "Sync Plaid",
    value: "sync-plaid",
    description: "Sync Plaid account connections",
    color: "info",
    icon: "lucide:link",
  },
];

// Run admin task
const runAdminTask = async (taskName: string) => {
  try {
    isRunning.value = true;
    runningTask.value = taskName;

    toast.add({
      color: "info",
      description: `Starting ${taskName} task...`,
    });

    const { error } = await useAPI(`/api/tasks/${taskName}`, {
      method: "POST",
    });

    if (error.value) {
      toast.add({
        color: "error",
        description: `${taskName} task failed: ${error.value.message}`,
      });
    } else {
      toast.add({
        color: "success",
        description: `${taskName} task completed successfully.`,
      });
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : `An error occurred while running ${taskName} task.`;
    toast.add({
      color: "error",
      description: message,
    });
  } finally {
    isRunning.value = false;
    runningTask.value = "";
  }
};
</script>

<template lang="pug">
div(class="max-w-2xl mx-auto")
  UAlert(
    color="info"
    variant="soft"
    title="Legacy admin tab"
    description="Admin management is now available in the dedicated Admin Console."
    class="mb-6"
  )
  UButton(
    to="/admin"
    color="primary"
    variant="soft"
    class="mb-6") Open Admin Console


  div(class="mb-6")
    NuxtLink(
      to="/edit-profile/openai-logs"
      class="text-primary underline text-sm"
    ) OpenAI request logs

  div(class="space-y-6")
    // Task Buttons Grid
    div(class="grid grid-cols-1 md:grid-cols-2 gap-4")
      div(
        v-for="task in adminTasks"
        :key="task.value"
        class="p-4 border rounded-lg hover:shadow-md transition-shadow"
      )
        div(class="flex items-center space-x-3 mb-2")
          UIcon(:name="task.icon" class="w-5 h-5")
          h3(class="text-lg font-semibold") {{ task.label }}

        p(class="text-sm text-gray-600 mb-4") {{ task.description }}

        UButton(
          @click="runAdminTask(task.value)"
          :loading="isRunning && runningTask === task.value"
          :disabled="isRunning"
          :color="task.color"
          size="lg"
          class="w-full"
        )
          span(v-if="isRunning && runningTask === task.value") Running...
          span(v-else) Run {{ task.label }}

</template>
