import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia, defineStore } from "pinia";
import type { User } from "~/types/types";

(globalThis as any).defineStore = defineStore;
const authStoreModule = await import("../authStore");
(globalThis as any).useAuthStore = authStoreModule.useAuthStore;
const listStoreModule = await import("../listStore");
(globalThis as any).useListStore = listStoreModule.useListStore;
const { useAuthStore } = authStoreModule;

const useAPIStub = vi.fn(() => ({
  data: { value: null },
  error: { value: null },
}));
const useRequestHeadersStub = vi.fn(() => ({}));
const apiClient = vi.fn().mockResolvedValue(undefined);

vi.stubGlobal("useAPI", useAPIStub);
vi.stubGlobal("useRequestHeaders", useRequestHeadersStub);
vi.stubGlobal("useNuxtApp", vi.fn(() => ({ $api: apiClient })));

describe("authStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(console, "log").mockImplementation(() => {});
    useAPIStub.mockReturnValue({
      data: { value: null },
      error: { value: null },
    });
    useRequestHeadersStub.mockReturnValue({});
    apiClient.mockReset();
    apiClient.mockResolvedValue(undefined);
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
    store.setUser({
      id: 1,
      firstName: "J",
      lastName: "D",
      email: "j@d.co",
      password: "",
    } as User);
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

  it("validateLogin sets user and isLoggedIn when /api/user succeeds", async () => {
    const store = useAuthStore();
    const mockUser = {
      id: 1,
      firstName: "J",
      lastName: "D",
      email: "j@d.co",
      password: "",
    } as User;
    const userRef = { value: null as User | null };
    const errorRef = { value: null as { status?: number } | null };

    useAPIStub.mockReturnValue({
      data: userRef,
      error: errorRef,
    } as any);

    userRef.value = mockUser;

    await store.validateLogin();

    expect(useAPIStub).toHaveBeenCalledWith(
      "/api/user",
      expect.objectContaining({
        server: true,
        credentials: "include",
      }),
    );
    expect(store.getIsUserLoggedIn).toBe(true);
    expect(store.getUser).toEqual(mockUser);
  });

  it("validateLogin clears state on API 401", async () => {
    const store = useAuthStore();
    const userRef = { value: null as User | null };
    const errorRef = { value: { status: 401 } as { status?: number } };

    useAPIStub.mockReturnValue({ data: userRef, error: errorRef } as any);

    await store.validateLogin();

    expect(store.getIsUserLoggedIn).toBe(false);
    expect(store.getToken).toBe("");
    expect(store.getUser).toBeNull();
  });

  it("validateLogin clears state on API 403", async () => {
    const store = useAuthStore();
    const userRef = { value: null as User | null };
    const errorRef = { value: { status: 403 } as { status?: number } };

    useAPIStub.mockReturnValue({ data: userRef, error: errorRef } as any);

    await store.validateLogin();

    expect(store.getIsUserLoggedIn).toBe(false);
    expect(store.getToken).toBe("");
    expect(store.getUser).toBeNull();
  });

  it("validateLogin sets isLoggedIn false on non-auth API error", async () => {
    const store = useAuthStore();
    const userRef = { value: null as User | null };
    const errorRef = { value: { status: 500 } as { status?: number } };

    useAPIStub.mockReturnValue({ data: userRef, error: errorRef } as any);

    await store.validateLogin();

    expect(store.getIsUserLoggedIn).toBe(false);
  });

  it("validateLogin sets isLoggedIn false when user data is missing without error", async () => {
    const store = useAuthStore();
    const userRef = { value: null as User | null };
    const errorRef = { value: null };

    useAPIStub.mockReturnValue({ data: userRef, error: errorRef } as any);

    await store.validateLogin();

    expect(store.getIsUserLoggedIn).toBe(false);
  });

  it("validateLogin sets isLoggedIn false when useAPI throws", async () => {
    const store = useAuthStore();
    useAPIStub.mockImplementation(() => {
      throw new Error("network");
    });

    await store.validateLogin();

    expect(store.getIsUserLoggedIn).toBe(false);
  });
});
