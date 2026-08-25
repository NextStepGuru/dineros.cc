import { getPostLoginRedirect } from "~/lib/auth";
import { readWorkflowModeFromStorage } from "~/lib/workflowMode";

export default defineNuxtRouteMiddleware(() => {
  const authStore = useAuthStore();
  if (!authStore.getIsUserLoggedIn) {
    return;
  }

  const listStore = useListStore();
  return navigateTo(
    getPostLoginRedirect(
      listStore.getAccountRegisters,
      readWorkflowModeFromStorage() ?? "forecasting",
    ),
    { replace: true },
  );
});
