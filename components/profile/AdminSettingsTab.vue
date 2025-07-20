<script setup lang="ts">
const toast = useToast();
const authStore = useAuthStore();

// Ensure only userId = 1 can access this
if (authStore.getUser?.id !== 1) {
  throw createError({
    statusCode: 403,
    statusMessage: "Access Denied",
  });
}

const isRunning = ref(false);
const runningTask = ref("");

// Admin tasks available
const adminTasks = [
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

    const { data, error } = await useAPI(`/api/tasks/${taskName}`, {
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
    toast.add({
      color: "error",
      description: `An error occurred while running ${taskName} task.`,
    });
  } finally {
    isRunning.value = false;
    runningTask.value = "";
  }
};
</script>

<template lang="pug">
div(class="max-w-2xl min-h-96 my-4 m-auto")
  h2(class="text-xl font-bold text-center mb-6") Admin Tasks

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
