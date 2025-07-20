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

// Debug tasks available
const debugTasks = [
  {
    label: "Check Balance Entries",
    value: "check-balance-entries",
    description: "Verify balance entry calculations",
    color: "success",
    icon: "lucide:calculator",
  },
  {
    label: "Check Pending Status",
    value: "check-pending-status",
    description: "Review pending transaction status",
    color: "warning",
    icon: "lucide:clock",
  },
  {
    label: "Check Yearly Reoccurrences",
    value: "check-yearly-reoccurrences",
    description: "Validate yearly recurring transactions",
    color: "info",
    icon: "lucide:calendar",
  },
  {
    label: "Cleanup Balance Entries",
    value: "cleanup-balance-entries",
    description: "Remove invalid balance entries",
    color: "error",
    icon: "lucide:trash-2",
  },
  {
    label: "Debug Balance Entry",
    value: "debug-balance-entry",
    description: "Debug specific balance entry issues",
    color: "secondary",
    icon: "lucide:bug",
  },
  {
    label: "Forecast Cache Debug",
    value: "forecast-cache-debug",
    description: "Debug forecast caching issues",
    color: "primary",
    icon: "lucide:bar-chart-3",
  },
  {
    label: "Test Balance Entry",
    value: "test-balance-entry",
    description: "Test balance entry functionality",
    color: "success",
    icon: "lucide:test-tube",
  },
  {
    label: "Test Forecast",
    value: "test-forecast",
    description: "Test forecast calculations",
    color: "info",
    icon: "lucide:trending-up",
  },
  {
    label: "Test Register Entries",
    value: "test-register-entries",
    description: "Test register entry processing",
    color: "secondary",
    icon: "lucide:list-checks",
  },
];

// Run debug task
const runDebugTask = async (taskName: string) => {
  try {
    isRunning.value = true;
    runningTask.value = taskName;

    toast.add({
      color: "info",
      description: `Starting ${taskName} debug task...`,
    });

    const { data, error } = await useAPI(`/api/tasks/${taskName}`, {
      method: "POST",
    });

    if (error.value) {
      toast.add({
        color: "error",
        description: `${taskName} debug task failed: ${error.value.message}`,
      });
    } else {
      toast.add({
        color: "success",
        description: `${taskName} debug task completed successfully.`,
      });
    }
  } catch (error) {
    toast.add({
      color: "error",
      description: `An error occurred while running ${taskName} debug task.`,
    });
  } finally {
    isRunning.value = false;
    runningTask.value = "";
  }
};
</script>

<template lang="pug">
div(class="max-w-4xl min-h-96 my-4 m-auto")
  h2(class="text-xl font-bold text-center mb-6") Debug Tasks

  div(class="space-y-6")
    // Task Buttons Grid
    div(class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4")
      div(
        v-for="task in debugTasks"
        :key="task.value"
        class="p-4 border rounded-lg hover:shadow-md transition-shadow"
      )
        div(class="flex items-center space-x-3 mb-2")
          UIcon(:name="task.icon" class="w-5 h-5")
          h3(class="text-lg font-semibold") {{ task.label }}

        p(class="text-sm text-gray-600 mb-4") {{ task.description }}

        UButton(
          @click="runDebugTask(task.value)"
          :loading="isRunning && runningTask === task.value"
          :disabled="isRunning"
          :color="task.color"
          size="lg"
          class="w-full"
        )
          span(v-if="isRunning && runningTask === task.value") Running...
          span(v-else) Run {{ task.label }}

</template>
