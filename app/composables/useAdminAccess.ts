/**
 * Matches server `requireAdmin`: `User.role === ADMIN` or email equals
 * `runtimeConfig.public.adminEmail` (typically `NUXT_PUBLIC_ADMIN_EMAIL`).
 */
export function useAdminAccess() {
  const authStore = useAuthStore();
  const config = useRuntimeConfig();

  const isAdminConsoleUser = computed(() => {
    const user = authStore.getUser;
    if (!user) return false;
    if (user.role === "ADMIN") return true;
    const adminEmail = String(config.public.adminEmail ?? "")
      .trim()
      .toLowerCase();
    if (!adminEmail) return false;
    return String(user.email ?? "")
      .trim()
      .toLowerCase() === adminEmail;
  });

  return { isAdminConsoleUser };
}
