import type { User } from "~/types/types";

export const useAuthStore = defineStore("authStore", {
  state: () => ({
    isLoggedIn: false,
    token: "",
    user: {} as User | null,
    budgetId: 0,
  }),
  getters: {
    getIsUserLoggedIn: (state) => state.isLoggedIn,
    getToken: (state) => state.token,
    getUser: (state) => state.user,
    getBudgetId: (state) => state.budgetId,

    hasPlaidConnected: (state) =>
      state.user?.settings?.plaid?.isEnabled !== undefined &&
      state.user.settings.plaid.isEnabled === true,
    has2faEnabled: (state) => {
      const mfa = state.user?.settings?.mfa;
      if (mfa) {
        const hasTotp = Boolean(mfa.totp?.isEnabled && mfa.totp?.isVerified);
        const hasPasskey =
          Array.isArray(mfa.passkeys) && mfa.passkeys.length > 0;
        const hasEmailOtp = Boolean(mfa.emailOtp?.isEnabled);
        return hasTotp || hasPasskey || hasEmailOtp;
      }

      return Boolean(
        state.user?.settings?.speakeasy?.isEnabled &&
        state.user?.settings?.speakeasy?.isVerified,
      );
    },
  },
  actions: {
    setBudgetId(budgetId: number | string) {
      this.budgetId = +budgetId;
    },
    async validateLogin() {
      try {
        const headers =
          import.meta.server && import.meta.prerender === false
            ? useRequestHeaders(["cookie"])
            : undefined;

        const { data: user, error } = await useAPI<User>("/api/user", {
          server: true,
          headers: headers as Record<string, string> | undefined,
          credentials: "include",
        });

        if (!error.value && user.value) {
          this.user = user.value;
          this.isLoggedIn = true;
          if (import.meta.client) {
            try {
              const refreshed = await useNuxtApp().$api<{ token: string }>(
                "/api/validate-token",
                { credentials: "include" },
              );
              if (refreshed?.token) {
                this.token = refreshed.token;
              }
            } catch {
              // Cookie-only session still works for same-origin API calls
            }
          }
          return;
        }

        if (error.value?.status === 401 || error.value?.status === 403) {
          this.isLoggedIn = false;
          this.token = "";
          this.user = null;
          return;
        }

        if (error.value) {
          console.log({
            message: "API validation failed:",
            data: error.value,
            level: "warn",
          });
          this.isLoggedIn = false;
          return;
        }

        this.isLoggedIn = false;
      } catch (error) {
        console.log({
          message: "Could not validate login:",
          data: error,
          level: "warn",
        });
        this.isLoggedIn = false;
      }
    },
    setToken(token: string) {
      this.token = token;
      this.isLoggedIn = true;
    },
    setUser(user: User) {
      this.user = user;
    },
    setIsLoggedIn(isLoggedIn: boolean) {
      this.isLoggedIn = isLoggedIn;
    },
    async logout() {
      // Prevent multiple logout calls
      if (!this.isLoggedIn && !this.token) {
        return;
      }

      this.token = "";
      this.isLoggedIn = false;
      this.user = null;
      this.budgetId = 0;

      if (import.meta.client) {
        try {
          localStorage.removeItem("authToken");
        } catch (error) {
          console.log({
            message: "Error removing authToken from localStorage:",
            data: error,
            level: "debug",
          });
        }
        try {
          await useNuxtApp().$api("/api/logout", {
            method: "POST",
            credentials: "include",
          });
        } catch (error) {
          console.log({
            message: "Could not clear httpOnly session cookie:",
            data: error,
            level: "warn",
          });
        }
      }

      // Try to reset list store, but don't fail if we're outside Nuxt context
      try {
        useListStore().resetList();
      } catch (error) {
        console.log({
          message: "Could not reset list store:",
          data: error,
          level: "warn",
        });
      }
    },
    disconnectPlaid() {
      if (this.user) {
        const settings = { ...this.user?.settings };
        settings.plaid.isEnabled = false;
        settings.plaid.public_token = undefined;
        this.user.settings = settings;
      }
    },
  },
});
