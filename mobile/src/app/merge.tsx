import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getRegisterEntries, mergeEntries } from "@/api/endpoints";
import type { RegisterEntry } from "@/api/types";
import { MoneyText } from "@/components/MoneyText";
import { colors, radius, spacing } from "@/constants/theme";
import { formatDate, num } from "@/lib/money";

export default function MergeScreen() {
  const params = useLocalSearchParams<{
    accountRegisterId: string;
    keepId: string;
    keepLabel: string;
  }>();
  const registerId = Number(params.accountRegisterId);
  const keepId = String(params.keepId ?? "");
  const keepLabel = String(params.keepLabel ?? "");
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<RegisterEntry | null>(null);

  const futureQ = useQuery({
    queryKey: ["register", registerId, "future", "merge"],
    queryFn: () =>
      getRegisterEntries({
        accountRegisterId: registerId,
        direction: "future",
        take: 200,
      }),
    enabled: registerId > 0,
  });
  const pastQ = useQuery({
    queryKey: ["register", registerId, "past", "merge"],
    queryFn: () =>
      getRegisterEntries({
        accountRegisterId: registerId,
        direction: "past",
        take: 200,
      }),
    enabled: registerId > 0,
  });

  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const all = [
      ...(futureQ.data?.entries ?? []),
      ...(pastQ.data?.entries ?? []),
    ];
    return all.filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return (
        entry.id !== keepId &&
        !entry.isBalanceEntry &&
        !entry.isReconciled
      );
    });
  }, [futureQ.data, pastQ.data, keepId]);

  const mergeM = useMutation({
    mutationFn: () =>
      mergeEntries({
        accountRegisterId: registerId,
        keepRegisterEntryId: keepId,
        duplicateRegisterEntryId: selected!.id,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["register", registerId] });
      void queryClient.invalidateQueries({ queryKey: ["lists"] });
      Alert.alert(
        "Merged",
        `Deleted "${selected?.description}". The kept entry is unchanged.`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    },
    onError: (err) =>
      Alert.alert(
        "Merge failed",
        err instanceof Error ? err.message : "Something went wrong.",
      ),
  });

  function confirmMerge() {
    if (!selected) return;
    Alert.alert(
      "Merge transactions",
      `Keep "${keepLabel}" and delete "${selected.description}"?\n\nThe kept entry is not modified.`,
      [
        { style: "cancel", text: "Cancel" },
        {
          style: "destructive",
          text: "Delete duplicate",
          onPress: () => mergeM.mutate(),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Merge duplicate</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Keep: {keepLabel}
          </Text>
        </View>
      </View>

      <Text style={styles.hint}>
        Pick the duplicate to delete. The kept entry stays as-is.
      </Text>

      <FlatList
        data={candidates}
        keyExtractor={(entry) => entry.id}
        refreshControl={
          <RefreshControl
            refreshing={futureQ.isRefetching || pastQ.isRefetching}
            onRefresh={() => {
              void futureQ.refetch();
              void pastQ.refetch();
            }}
            tintColor={colors.textSecondary}
          />
        }
        ListEmptyComponent={
          futureQ.isLoading || pastQ.isLoading ? (
            <Text style={styles.empty}>Loading…</Text>
          ) : (
            <Text style={styles.empty}>No other entries on this register.</Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.row,
              selected?.id === item.id && styles.rowSelected,
            ]}
            onPress={() => setSelected(item)}
          >
            <View style={styles.rowMain}>
              <Text style={styles.description} numberOfLines={1}>
                {item.description}
              </Text>
              <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
            </View>
            <MoneyText value={num(item.amount)} style={styles.amount} />
          </Pressable>
        )}
      />

      <View style={styles.footer}>
        <Pressable
          disabled={!selected}
          style={[styles.mergeButton, !selected && { opacity: 0.4 }]}
          onPress={confirmMerge}
        >
          <Text style={styles.mergeText}>
            {selected ? `Delete "${selected.description}"` : "Select a duplicate"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  back: { color: colors.accent, fontSize: 16, fontWeight: "700" },
  headerCenter: { flex: 1 },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  subtitle: { color: colors.textSecondary, fontSize: 12 },
  hint: {
    color: colors.textSecondary,
    fontSize: 13,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rowSelected: { borderColor: colors.danger },
  rowMain: { flex: 1 },
  description: { color: colors.text, fontSize: 15 },
  date: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "700" },
  empty: { color: colors.textSecondary, padding: spacing.xl, textAlign: "center" },
  footer: { padding: spacing.lg },
  mergeButton: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
  },
  mergeText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
