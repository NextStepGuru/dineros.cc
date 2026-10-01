import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors, radius, spacing } from "@/constants/theme";

export function Button({
  label,
  variant = "primary",
  loading,
  disabled,
  onPress,
}: {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const palette = {
    primary: { bg: colors.accent, fg: "#1a1a1a" },
    secondary: { bg: colors.surfaceAlt, fg: colors.text },
    danger: { bg: colors.danger, fg: "#ffffff" },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, opacity: disabled || loading ? 0.55 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  label: { fontSize: 16, fontWeight: "700" },
});
