export default defineNuxtPlugin((nuxtApp) => {
  const authStore = useAuthStore();

  return {
    provide: {
      api: $fetch.create({
        credentials: "include",
        onRequest({ options }) {
          // Send token if we have one, regardless of isLoggedIn status
          // This allows token validation during initialization
          const token = authStore.getToken;
          if (token) {
            options.headers.set(
              "Authorization",
              `Bearer ${token}`
            );
          }
        },
        async onResponseError({ response }) {
          if (response.status === 401 && import.meta.client) {
            // Run logout within Nuxt context to avoid composable errors
            await nuxtApp.runWithContext(() => {
              authStore.logout();
            });

            // Only redirect if we're not already on a public page
            const currentPath = globalThis.location.pathname;
            const publicRoutes = ['/login', '/signup', '/forgot-password', '/reset-password-with-code', '/'];

            if (!publicRoutes.includes(currentPath)) {
              await nuxtApp.runWithContext(() =>
                navigateTo(
                  "/login?toast=Your session has expired. Please log in again."
                )
              );
            }
          }
        },
      }),
    },
    name: "api",
    parallel: true,
  };
});
