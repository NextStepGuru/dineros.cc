import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";

import { configureApiClient } from "@/api/client";
import * as api from "@/api/endpoints";
import type { SessionUser } from "@/api/types";

const TOKEN_KEY = "dineros.token";
const USER_KEY = "dineros.user";
const TOKEN_AT_KEY = "dineros.tokenAt";
/** Sliding session: refresh when the 24h JWT is older than 23h. */
const REFRESH_AFTER_MS = 23 * 60 * 60 * 1000;

export type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthContextValue = {
  status: AuthStatus;
  user: SessionUser | null;
  signIn: (token: string, user: SessionUser | null) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  status: "loading",
  user: null,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  // Refs so the api client hooks always read fresh values without re-binding.
  const statusRef = useRef<AuthStatus>("loading");
  const refreshingRef = useRef(false);

  const setStatusSafe = useCallback((next: AuthStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const persistSession = useCallback(
    async (token: string, sessionUser: SessionUser | null) => {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      if (sessionUser) {
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(sessionUser));
        setUser(sessionUser);
      }
      await SecureStore.setItemAsync(TOKEN_AT_KEY, String(Date.now()));
    },
    [],
  );

  const signIn = useCallback(
    async (token: string, sessionUser: SessionUser | null) => {
      await persistSession(token, sessionUser);
      setStatusSafe("authenticated");
    },
    [persistSession, setStatusSafe],
  );

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // best-effort — the local session is discarded regardless
    }
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
      SecureStore.deleteItemAsync(TOKEN_AT_KEY),
    ]);
    setUser(null);
    setStatusSafe("anonymous");
  }, [setStatusSafe]);

  // Hydrate the persisted session on startup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        const userJson = await SecureStore.getItemAsync(USER_KEY);
        if (cancelled) return;
        if (token) {
          if (userJson) {
            try {
              setUser(JSON.parse(userJson) as SessionUser);
            } catch {
              // corrupted user cache — session still works, /api/user can refill it
            }
          }
          setStatusSafe("authenticated");
        } else {
          setStatusSafe("anonymous");
        }
      } catch {
        if (!cancelled) setStatusSafe("anonymous");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setStatusSafe]);

  // Wire the fetch wrapper to the session.
  useEffect(() => {
    configureApiClient({
      getToken: async () => SecureStore.getItemAsync(TOKEN_KEY),
      refresh: async () => {
        if (refreshingRef.current || statusRef.current !== "authenticated") {
          return false;
        }
        refreshingRef.current = true;
        try {
          const res = await api.validateToken();
          if (!res.token) return false;
          await persistSession(res.token, res.user ?? null);
          return true;
        } catch {
          return false;
        } finally {
          refreshingRef.current = false;
        }
      },
      onSessionExpired: () => {
        if (statusRef.current === "authenticated") {
          void SecureStore.deleteItemAsync(TOKEN_KEY);
          void SecureStore.deleteItemAsync(USER_KEY);
          void SecureStore.deleteItemAsync(TOKEN_AT_KEY);
          setUser(null);
          setStatusSafe("anonymous");
        }
      },
    });
  }, [persistSession, setStatusSafe]);

  // Sliding refresh when the app comes to the foreground.
  useEffect(() => {
    if (status !== "authenticated") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      (async () => {
        const tokenAt = Number(
          (await SecureStore.getItemAsync(TOKEN_AT_KEY)) ?? 0,
        );
        if (Date.now() - tokenAt < REFRESH_AFTER_MS) return;
        const res = await api.validateToken();
        if (res.token) {
          await persistSession(res.token, res.user ?? null);
        }
      })().catch(() => {
        // offline / transient — the next 401 path handles hard failures
      });
    });
    return () => subscription.remove();
  }, [status, persistSession]);

  const value = useMemo(
    () => ({ status, user, signIn, signOut }),
    [status, user, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
