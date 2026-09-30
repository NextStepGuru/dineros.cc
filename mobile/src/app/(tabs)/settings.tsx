import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { apiBaseUrl } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { colors, spacing } from "@/constants/theme";

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  function confirmSignOut() {
    Alert.alert("Sign out", "Discard the saved session on this device?", [
      { style: "cancel", text: "Cancel" },
      {
        style: "destructive",
        text: "Sign out",
        onPress: () => {
          setSigningOut(true);
          void signOut().finally(() => setSigningOut(false));
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.value}>
            {user ? `${user.firstName} ${user.lastName}` : "…"}
          </Text>
          <Text style={styles.sub}>{user?.email ?? ""}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Server</Text>
          <Text style={styles.value}>{apiBaseUrl}</Text>
          <Text style={styles.sub}>
            Set EXPO_PUBLIC_API_URL to point at another environment.
          </Text>
        </View>

        <Button
          label="Sign out"
          variant="danger"
          loading={signingOut}
          onPress={confirmSignOut}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  container: { gap: spacing.lg, padding: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  value: { color: colors.text, fontSize: 16, fontWeight: "600" },
  sub: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
});
