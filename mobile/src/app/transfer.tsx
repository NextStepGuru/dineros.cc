import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createTransfer, getLists } from "@/api/endpoints";
import type { AccountRegister } from "@/api/types";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { RegisterPicker } from "@/components/RegisterPicker";
import { colors, radius, spacing } from "@/constants/theme";
import { num, todayInputValue } from "@/lib/money";

export default function TransferScreen() {
  const params = useLocalSearchParams<{ sourceId?: string }>();
  const queryClient = useQueryClient();

  const listsQ = useQuery({ queryKey: ["lists"], queryFn: getLists });
  const registers = useMemoRegisterList(listsQ.data?.accountRegisters);

  const [source, setSource] = useState<AccountRegister | null>(
    registers.find((r) => String(r.id) === params.sourceId) ?? null,
  );
  const [target, setTarget] = useState<AccountRegister | null>(null);
  const [picking, setPicking] = useState<"source" | "target" | null>(null);
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [error, setError] = useState<string | null>(null);

  const createM = useMutation({
    mutationFn: () =>
      createTransfer({
        sourceAccountRegisterId: source!.id,
        targetAccountRegisterId: target!.id,
        amount: Number(amountText),
        description: description.trim(),
        createdAt: new Date(`${date}T00:00:00.000Z`).toISOString(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lists"] });
      void queryClient.invalidateQueries({ queryKey: ["register"] });
      Alert.alert("Transfer created", "The transfer entries were added to both registers.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Failed to create transfer"),
  });

  const amount = Number(amountText);
  const valid =
    source !== null &&
    target !== null &&
    source.id !== target.id &&
    Number.isFinite(amount) &&
    amount !== 0 &&
    description.trim().length >= 3 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date);

  function pick(selected: AccountRegister) {
    if (picking === "source") setSource(selected);
    if (picking === "target") setTarget(selected);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>New transfer</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <PickerRow
            label="From"
            value={source?.name}
            onPress={() => setPicking("source")}
          />
          <PickerRow
            label="To"
            value={target?.name}
            onPress={() => setPicking("target")}
          />
          <Field
            label="Amount"
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Transfer for Groceries"
            autoCapitalize="sentences"
          />
          <Field
            label="Date (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
            placeholder={todayInputValue()}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label="Create transfer"
            disabled={!valid}
            loading={createM.isPending}
            onPress={() => createM.mutate()}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {picking ? (
        <RegisterPicker
          registers={registers.filter((r) =>
            picking === "source" ? r.id !== target?.id : r.id !== source?.id,
          )}
          value={picking === "source" ? source : target}
          onSelect={pick}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function useMemoRegisterList(all: AccountRegister[] | undefined) {
  return (all ?? []).filter((r) => !r.isArchived);
}

function PickerRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.pickerRow} onPress={onPress}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <Text style={[styles.pickerValue, !value && styles.pickerPlaceholder]}>
        {value ?? "Choose register…"}
      </Text>
      <Text style={styles.pickerChevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  back: { color: colors.accent, fontSize: 16, fontWeight: "700" },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  scroll: { gap: spacing.lg, padding: spacing.lg },
  pickerRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  pickerLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    width: 44,
  },
  pickerValue: { color: colors.text, flex: 1, fontSize: 16 },
  pickerPlaceholder: { color: colors.textSecondary },
  pickerChevron: { color: colors.textSecondary, fontSize: 20 },
  error: { color: colors.negative, fontSize: 14, textAlign: "center" },
});
