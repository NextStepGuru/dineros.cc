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
    console.error("Failed to fetch lists:", error);
  }
});
