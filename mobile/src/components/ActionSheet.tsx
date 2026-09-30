import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants/theme";

export type ActionOption = {
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

/** Minimal bottom action sheet — no extra dependency. */
export function ActionSheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title?: string;
  options: ActionOption[];
  onClose: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {options.map((option) => (
            <Pressable
              key={option.label}
              style={({ pressed }) => [styles.option, pressed && { opacity: 0.7 }]}
              onPress={() => {
                onClose();
                option.onPress();
              }}
            >
              <Text style={[styles.optionText, option.destructive && { color: colors.negative }]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
          <Pressable style={[styles.option, styles.cancel]} onPress={onClose}>
            <Text style={[styles.optionText, styles.cancelText]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.6)", flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  title: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  option: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  optionText: { color: colors.text, fontSize: 16 },
  cancel: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: spacing.xs },
  cancelText: { color: colors.textSecondary, textAlign: "center" },
});
