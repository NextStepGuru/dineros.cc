export default defineNuxtRouteMiddleware(() => {
  const authStore = useAuthStore();

  if (!authStore.getIsUserLoggedIn) {
    return navigateTo("/login");
  }

  if (authStore.getUser?.role !== "ADMIN") {
    if (import.meta.client) {
      useToast().add({
        color: "error",
        description: "You do not have access to that admin page.",
      });
    }
    return navigateTo("/");
  }
});
