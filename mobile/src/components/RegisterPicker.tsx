import { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { AccountRegister } from "@/api/types";
import { colors, radius, spacing } from "@/constants/theme";
import { num } from "@/lib/money";
import { MoneyText } from "./MoneyText";

/**
 * Modal picker over account registers (parents and pockets together).
 * Pockets are labeled with their parent's name for context.
 */
export function RegisterPicker({
  registers,
  value,
  onSelect,
  onClose,
}: {
  registers: AccountRegister[];
  value: AccountRegister | null;
  onSelect: (register: AccountRegister) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const nameById = new Map(registers.map((r) => [r.id, r.name] as const));
  const filtered = registers.filter((r) => {
    if (!query) return true;
    const parent = r.subAccountRegisterId
      ? nameById.get(r.subAccountRegisterId)
      : null;
    const haystack = `${r.name} ${parent ?? ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <Modal animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.heading}>Choose register</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search registers…"
          placeholderTextColor={colors.textSecondary}
          style={styles.search}
          autoCorrect={false}
        />
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => {
            const parentName = item.subAccountRegisterId
              ? nameById.get(item.subAccountRegisterId)
              : null;
            const selected = value?.id === item.id;
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {parentName ? `↳ ${item.name}` : item.name}
                  </Text>
                  {parentName ? (
                    <Text style={styles.parent}>{parentName}</Text>
                  ) : null}
                </View>
                <MoneyText value={num(item.latestBalance)} style={styles.balance} />
                {selected ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            );
          }}
        />
        <Pressable style={styles.close} onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  heading: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  search: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
  },
  row: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  rowText: { flex: 1 },
  name: { color: colors.text, fontSize: 16 },
  parent: { color: colors.textSecondary, fontSize: 13 },
  balance: { color: colors.textSecondary, fontSize: 14 },
  check: { color: colors.accent, fontSize: 16, fontWeight: "700" },
  close: { alignItems: "center", paddingVertical: spacing.lg },
  closeText: { color: colors.textSecondary, fontSize: 16 },
});
