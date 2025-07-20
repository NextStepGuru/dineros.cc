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
    has2faEnabled: (state) =>
      state.user?.settings?.speakeasy?.isEnabled !== undefined &&
      state.user.settings.speakeasy.isEnabled === true &&
      state.user.settings.speakeasy.isVerified === true,
  },
  actions: {
    setBudgetId(budgetId: number | string) {
      this.budgetId = +budgetId;
    },
    async validateLogin() {
      try {
        const authTokenCookie = useCookie<string | undefined>("authToken", {
          secure: false,
          httpOnly: false,
          sameSite: "lax",
          maxAge: 86400, // 24 hours
          path: "/",
        });

        if (authTokenCookie.value) {
          this.token = authTokenCookie.value;

          // Check if token is expired before making API call
          try {
            const tokenPayload = JSON.parse(atob(this.token.split('.')[1]));
            const now = Math.floor(Date.now() / 1000);
            if (tokenPayload.exp && tokenPayload.exp < now) {
              console.log("Token is expired, clearing cookie");
              authTokenCookie.value = undefined;
              this.isLoggedIn = false;
              this.token = "";
              this.user = null;
              return;
            }
          } catch (error) {
            console.log("Error parsing token:", error);
            // If we can't parse the token, it's invalid
            authTokenCookie.value = undefined;
            this.isLoggedIn = false;
            this.token = "";
            this.user = null;
            return;
          }

          // Don't set isLoggedIn = true yet, wait for API verification
          const { data: user, error } = await useAPI<User>("/api/user");

          if (!error.value && user.value) {
            // Only set logged in if API call succeeded
            this.user = user.value;
            this.isLoggedIn = true;
          } else {
            // API call failed - check if it's a server error vs auth error
            console.warn("API validation failed:", error.value);

            // Only clear auth state if it's definitely an auth error (401/403)
            // For network errors or server errors, preserve the token and try again later
            if (error.value?.status === 401 || error.value?.status === 403) {
              console.log("Authentication failed, clearing auth state");
              this.isLoggedIn = false;
              this.token = "";
              this.user = null;
              authTokenCookie.value = undefined;
            } else {
              // For other errors (500, network issues, etc.), keep the token
              // but don't set isLoggedIn yet - let the user retry
              console.log("Non-auth error, preserving token for retry");
              this.isLoggedIn = false;
              // Keep this.token and don't clear the cookie
            }
          }
        } else {
          this.isLoggedIn = false;
        }
      } catch (error) {
        console.warn("Could not validate login - cookie access failed:", error);
        // Don't clear tokens on cookie access errors - might be SSR context issues
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

      // Only try to access localStorage on the client side
      if (process.client) {
        try {
          localStorage.removeItem("authToken");
        } catch (error) {
          console.log("Error removing authToken from localStorage:", error);
        }
      }

      // Try to clear cookie, but don't fail if we're outside Nuxt context
      try {
        const authToken = useCookie<string | undefined>("authToken", {
          expires: new Date(Date.now() - 1),
          secure: false,
          httpOnly: false,
          sameSite: "lax",
          maxAge: 86400, // 24 hours - keep consistent
          path: "/",
        });
        authToken.value = undefined;
      } catch (error) {
        // Cookie clearing failed - this can happen when called outside Nuxt context
        // This is expected when logout is called from API error handlers
        console.warn("Could not clear auth cookie:", error);
      }

      // Try to reset list store, but don't fail if we're outside Nuxt context
      try {
        useListStore().resetList();
      } catch (error) {
        console.warn("Could not reset list store:", error);
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
