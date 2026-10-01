import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants/theme";

export function Badge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "accent" }) {
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: tone === "accent" ? colors.accent : colors.surfaceAlt },
      ]}
    >
      <Text style={[styles.text, tone === "accent" ? { color: "#1a1a1a" } : null]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  text: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
