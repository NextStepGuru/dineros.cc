import { Redirect, Tabs } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { colors } from "@/constants/theme";

export default function TabsLayout() {
  const { status } = useAuth();

  if (status === "loading") return null;
  if (status === "anonymous") return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="accounts" options={{ title: "Accounts" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
