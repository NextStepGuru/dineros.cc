import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
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

import { listMergeAudits, unmergeEntry } from "@/api/endpoints";
import type { MergeAudit } from "@/api/types";
import { MoneyText } from "@/components/MoneyText";
import { colors, radius, spacing } from "@/constants/theme";
import { formatDate, num } from "@/lib/money";

export default function UnmergeScreen() {
  const params = useLocalSearchParams<{ accountRegisterId: string }>();
  const registerId = Number(params.accountRegisterId);
  const queryClient = useQueryClient();

  const auditsQ = useQuery({
    queryKey: ["register", registerId, "merge-audits"],
    queryFn: () => listMergeAudits({ accountRegisterId: registerId }),
    enabled: registerId > 0,
  });

  const unmergeM = useMutation({
    mutationFn: (audit: MergeAudit) => unmergeEntry({ mergeAuditId: audit.id }),
    onSuccess: (_data, audit) => {
      void queryClient.invalidateQueries({ queryKey: ["register", registerId] });
      void queryClient.invalidateQueries({ queryKey: ["lists"] });
      Alert.alert(
        "Restored",
        `"${audit.entryDescription}" is back on the register.`,
        [{ text: "OK" }],
      );
    },
    onError: (err) =>
      Alert.alert(
        "Restore failed",
        err instanceof Error ? err.message : "Something went wrong.",
      ),
  });

  function confirmRestore(audit: MergeAudit) {
    Alert.alert(
      "Undo merge",
      `Restore "${audit.entryDescription}" to this register?`,
      [
        { style: "cancel", text: "Cancel" },
        {
          text: "Restore entry",
          onPress: () => unmergeM.mutate(audit),
        },
      ],
    );
  }

  const audits = auditsQ.data?.audits ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Undo merge</Text>
        </View>
      </View>

      <Text style={styles.hint}>
        Entries deleted by a merge, newest first. Restoring puts the entry
        back with its original date, amount, and description.
      </Text>

      <FlatList
        data={audits}
        keyExtractor={(audit) => audit.id}
        refreshControl={
          <RefreshControl
            refreshing={auditsQ.isRefetching}
            onRefresh={() => void auditsQ.refetch()}
            tintColor={colors.textSecondary}
          />
        }
        ListEmptyComponent={
          auditsQ.isLoading ? (
            <Text style={styles.empty}>Loading…</Text>
          ) : (
            <Text style={styles.empty}>No merges to undo on this register.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.description} numberOfLines={1}>
                {item.entryDescription}
              </Text>
              <Text style={styles.dates}>
                Entry {formatDate(item.entryCreatedAt)} · merged{" "}
                {formatDate(item.mergedAt)}
              </Text>
            </View>
            <MoneyText value={num(item.entryAmount)} style={styles.amount} />
            {item.restoredAt ? (
              <Text style={styles.restored}>Restored</Text>
            ) : (
              <Pressable
                style={styles.restoreButton}
                onPress={() => confirmRestore(item)}
                disabled={unmergeM.isPending}
              >
                <Text style={styles.restoreText}>Restore</Text>
              </Pressable>
            )}
          </View>
        )}
      />
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
  rowMain: { flex: 1 },
  description: { color: colors.text, fontSize: 15 },
  dates: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "700" },
  restored: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  restoreButton: {
    borderColor: colors.accent,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  restoreText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  empty: { color: colors.textSecondary, padding: spacing.xl, textAlign: "center" },
});
