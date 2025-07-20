export default defineNuxtRouteMiddleware((to) => {
  const authStore = useAuthStore();

  if (!authStore.getIsUserLoggedIn) {
    // List of public routes that don't require authentication
    const publicRoutes = ['/login', '/signup', '/forgot-password', '/reset-password-with-code', '/'];

    // Don't redirect if already on a public route to prevent infinite loop
    if (publicRoutes.includes(to.path)) {
      return; // Stay on public route
    }

    return navigateTo(
      "/login?toast=Your session has expired. Please log in again."
    );
  }
});
