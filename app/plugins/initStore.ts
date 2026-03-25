export default defineNuxtPlugin(async () => {
  const authStore = useAuthStore();
  const listStore = useListStore();

  try {
    await authStore.validateLogin();
    if (authStore.isLoggedIn) {
      await listStore.fetchLists();
      const defaultBudget = listStore.getDefaultBudget;
      if (defaultBudget) authStore.setBudgetId(defaultBudget.id);
    }
  } catch (error) {
    console.log({
      message: "Failed to fetch lists:",
      data: error,
      level: "error",
    });
  }
});
