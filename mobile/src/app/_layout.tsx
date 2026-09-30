import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";

import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { colors } from "@/constants/theme";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    primary: colors.accent,
    text: colors.text,
  },
};

function RootNavigator() {
  const { status } = useAuth();
  const [splashHidden, setSplashHidden] = useState(false);

  useEffect(() => {
    if (status !== "loading" && !splashHidden) {
      SplashScreen.hideAsync()
        .catch(() => {})
        .finally(() => setSplashHidden(true));
    }
  }, [status, splashHidden]);

  // Keep the native splash up until the persisted session has been resolved.
  if (status === "loading") return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="register/[id]" />
      <Stack.Screen name="transfer" />
      <Stack.Screen name="merge" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style="light" />
          <RootNavigator />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
