export default defineNuxtRouteMiddleware(() => {
  const authStore = useAuthStore();
  const config = useRuntimeConfig();

  if (!authStore.getIsUserLoggedIn) {
    return navigateTo("/login");
  }

  const user = authStore.getUser;
  const isRoleAdmin = user?.role === "ADMIN";
  const adminEmail = String(config.public.adminEmail ?? "")
    .trim()
    .toLowerCase();
  const isEmailAdmin =
    !!adminEmail &&
    String(user?.email ?? "")
      .trim()
      .toLowerCase() === adminEmail;

  if (!isRoleAdmin && !isEmailAdmin) {
    if (import.meta.client) {
      useToast().add({
        color: "error",
        description: "You do not have access to that admin page.",
      });
    }
    return navigateTo("/");
  }
});
