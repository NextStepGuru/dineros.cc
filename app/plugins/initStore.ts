export default defineNuxtPlugin(async () => {
  const authStore = useAuthStore();
  const listStore = useListStore();

  // useRequestFetch() must run here (plugin scope), not inside Pinia — otherwise SSR has no cookie context.
  // Use !prerender: when unset (typical in dev), `prerender === false` is false and SSR auth never runs.
  const ssrRequestFetch =
    import.meta.server && !import.meta.prerender
      ? useRequestFetch()
      : undefined;

  try {
    await authStore.validateLogin(ssrRequestFetch);
    if (authStore.isLoggedIn) {
      await listStore.fetchLists(ssrRequestFetch);
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
