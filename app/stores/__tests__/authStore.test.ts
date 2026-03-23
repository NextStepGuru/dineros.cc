import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia, defineStore } from "pinia";
import type { User } from "~/types/types";

(globalThis as any).defineStore = defineStore;
const authStoreModule = await import("../authStore");
(globalThis as any).useAuthStore = authStoreModule.useAuthStore;
const listStoreModule = await import("../listStore");
(globalThis as any).useListStore = listStoreModule.useListStore;
const { useAuthStore } = authStoreModule;

const useCookieStub = vi.fn(() => ({ value: undefined }));
const useAPIStub = vi.fn(() => ({
  data: { value: null },
  error: { value: null },
}));
vi.stubGlobal("useCookie", useCookieStub);
vi.stubGlobal("useAPI", useAPIStub);
vi.stubGlobal("useNuxtApp", vi.fn(() => ({})));
vi.stubGlobal("process", { ...process, client: false });

describe("authStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.mocked(console.log).mockRestore();
  });

  it("getters reflect initial state", () => {
    const store = useAuthStore();
    expect(store.getIsUserLoggedIn).toBe(false);
    expect(store.getToken).toBe("");
    expect(store.getUser).toEqual({});
    expect(store.getBudgetId).toBe(0);
    expect(store.hasPlaidConnected).toBe(false);
    expect(store.has2faEnabled).toBe(false);
  });

  it("setBudgetId updates budgetId", () => {
    const store = useAuthStore();
    store.setBudgetId(42);
    expect(store.getBudgetId).toBe(42);
    store.setBudgetId("99");
    expect(store.getBudgetId).toBe(99);
  });

  it("setToken sets token and isLoggedIn", () => {
    const store = useAuthStore();
    store.setToken("jwt-token");
    expect(store.getToken).toBe("jwt-token");
    expect(store.getIsUserLoggedIn).toBe(true);
  });

  it("setUser updates user", () => {
    const store = useAuthStore();
    const user = {
      id: 1,
      firstName: "J",
      lastName: "D",
      email: "j@d.co",
      password: "",
    } as User;
    store.setUser(user);
    expect(store.getUser).toEqual(user);
  });

  it("setIsLoggedIn updates isLoggedIn", () => {
    const store = useAuthStore();
    store.setIsLoggedIn(true);
    expect(store.getIsUserLoggedIn).toBe(true);
  });

  it("hasPlaidConnected is true when user.settings.plaid.isEnabled is true", () => {
    const store = useAuthStore();
    store.setUser({
      id: 1,
      firstName: "J",
      lastName: "D",
      email: "j@d.co",
      password: "",
      settings: {
        speakeasy: { isEnabled: false, isVerified: false },
        plaid: { isEnabled: true },
      },
    } as User);
    expect(store.hasPlaidConnected).toBe(true);
  });

  it("has2faEnabled is true when speakeasy is enabled and verified", () => {
    const store = useAuthStore();
    store.setUser({
      id: 1,
      firstName: "J",
      lastName: "D",
      email: "j@d.co",
      password: "",
      settings: {
        speakeasy: { isEnabled: true, isVerified: true },
        plaid: { isEnabled: false },
      },
    } as User);
    expect(store.has2faEnabled).toBe(true);
  });

  it("logout clears state", async () => {
    const store = useAuthStore();
    store.setToken("x");
    store.setUser({ id: 1, firstName: "J", lastName: "D", email: "j@d.co", password: "" } as User);
    store.setBudgetId(5);

    await store.logout();

    expect(store.getToken).toBe("");
    expect(store.getIsUserLoggedIn).toBe(false);
    expect(store.getUser).toBeNull();
    expect(store.getBudgetId).toBe(0);
  });

  it("logout does nothing when already logged out", async () => {
    const store = useAuthStore();
    expect(store.getIsUserLoggedIn).toBe(false);
    expect(store.getToken).toBe("");

    await store.logout();

    expect(store.getToken).toBe("");
    expect(store.getUser).toEqual({});
  });

  it("disconnectPlaid disables plaid on user settings", () => {
    const store = useAuthStore();
    const user = {
      id: 1,
      firstName: "J",
      lastName: "D",
      email: "j@d.co",
      password: "",
      settings: {
        speakeasy: { isEnabled: false, isVerified: false },
        plaid: { isEnabled: true, public_token: "pt_123" },
      },
    } as User;
    store.setUser(user);

    store.disconnectPlaid();

    expect(store.getUser?.settings?.plaid?.isEnabled).toBe(false);
    expect(store.getUser?.settings?.plaid?.public_token).toBeUndefined();
  });

  it("validateLogin sets isLoggedIn when cookie and API succeed", async () => {
    const store = useAuthStore();
    const mockUser = { id: 1, firstName: "J", lastName: "D", email: "j@d.co", password: "" } as User;
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    const token = `header.${payload}.sig`;
    const cookieRef = { value: token };
    const userRef = { value: null as User | null };
    const errorRef = { value: null as { status?: number } | null };

    useCookieStub.mockReturnValue(cookieRef as any);
    useAPIStub.mockReturnValue({
      data: userRef,
      error: errorRef,
    } as any);

    userRef.value = mockUser;

    await store.validateLogin();

    expect(store.getIsUserLoggedIn).toBe(true);
    expect(store.getUser).toEqual(mockUser);
  });

  it("validateLogin clears state when token is expired", async () => {
    const store = useAuthStore();
    store.setToken("old");
    store.setUser({ id: 1, firstName: "J", lastName: "D", email: "j@d.co", password: "" } as User);
    const payload = btoa(JSON.stringify({ exp: 1 }));
    const token = `h.${payload}.s`;
    const cookieRef = { value: token };

    useCookieStub.mockReturnValue(cookieRef as any);

    await store.validateLogin();

    expect(store.getIsUserLoggedIn).toBe(false);
    expect(store.getToken).toBe("");
    expect(store.getUser).toBeNull();
    expect(cookieRef.value).toBeUndefined();
  });

  it("validateLogin clears state when token parse fails", async () => {
    const store = useAuthStore();
    const cookieRef = { value: "not-valid-jwt" };

    useCookieStub.mockReturnValue(cookieRef as any);

    await store.validateLogin();

    expect(store.getIsUserLoggedIn).toBe(false);
    expect(store.getToken).toBe("");
    expect(cookieRef.value).toBeUndefined();
  });

  it("validateLogin clears state on API 401", async () => {
    const store = useAuthStore();
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    const token = `h.${payload}.s`;
    const cookieRef = { value: token };
    const userRef = { value: null as User | null };
    const errorRef = { value: { status: 401 } };

    useCookieStub.mockReturnValue(cookieRef as any);
    useAPIStub.mockReturnValue({ data: userRef, error: errorRef } as any);

    await store.validateLogin();

    expect(store.getIsUserLoggedIn).toBe(false);
    expect(store.getToken).toBe("");
    expect(store.getUser).toBeNull();
    expect(cookieRef.value).toBeUndefined();
  });

  it("validateLogin preserves token on non-auth API error", async () => {
    const store = useAuthStore();
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    const token = `h.${payload}.s`;
    const cookieRef = { value: token };
    const userRef = { value: null as User | null };
    const errorRef = { value: { status: 500 } };

    useCookieStub.mockReturnValue(cookieRef as any);
    useAPIStub.mockReturnValue({ data: userRef, error: errorRef } as any);

    await store.validateLogin();

    expect(store.getIsUserLoggedIn).toBe(false);
    expect(store.getToken).toBe(token);
    expect(cookieRef.value).toBe(token);
  });

  it("validateLogin sets isLoggedIn false when no cookie", async () => {
    const store = useAuthStore();
    useCookieStub.mockReturnValue({ value: undefined } as any);

    await store.validateLogin();

    expect(store.getIsUserLoggedIn).toBe(false);
  });

  it("validateLogin sets isLoggedIn false when cookie access throws", async () => {
    const store = useAuthStore();
    useCookieStub.mockImplementation(() => {
      throw new Error("Cookie unavailable");
    });

    await store.validateLogin();

    expect(store.getIsUserLoggedIn).toBe(false);
  });
});
