import { StyleSheet, Text } from "react-native";

import { colors } from "@/constants/theme";
import { formatMoney } from "@/lib/money";

export function MoneyText({
  value,
  colorize = true,
  style,
}: {
  value: number;
  colorize?: boolean;
  style?: object;
}) {
  const color = colorize ? (value < 0 ? colors.negative : colors.positive) : colors.text;
  return <Text style={[styles.text, { color }, style]}>{formatMoney(value)}</Text>;
}

const styles = StyleSheet.create({
  text: { fontVariant: ["tabular-nums"] },
});
