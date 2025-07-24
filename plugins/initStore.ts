import { log } from "~/server/logger";

export default defineNuxtPlugin(async () => {
  const authStore = useAuthStore();
  const listStore = useListStore();

  try {
    await authStore.validateLogin();
    if (authStore.isLoggedIn) {
      await listStore.fetchLists();
      authStore.setBudgetId(listStore.getBudgets[0].id);
    }
  } catch (error) {
    log({ message: "Failed to fetch lists:", data: error, level: "error" });
  }
});
