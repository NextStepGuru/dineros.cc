import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  applyEntryAsTransfer,
  clearEntry,
  getLists,
  getRegisterEntries,
} from "@/api/endpoints";
import type { RegisterDirection, RegisterEntry } from "@/api/types";
import { ActionSheet } from "@/components/ActionSheet";
import { Badge } from "@/components/Badge";
import { MoneyText } from "@/components/MoneyText";
import { RegisterPicker } from "@/components/RegisterPicker";
import { colors, radius, spacing } from "@/constants/theme";
import { formatDate, num } from "@/lib/money";

const PAGE_SIZE = 50;

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const registerId = Number(params.id);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [direction, setDirection] = useState<RegisterDirection>("future");
  const [actionEntry, setActionEntry] = useState<RegisterEntry | null>(null);
  const [pickingTransferTarget, setPickingTransferTarget] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const listsQ = useQuery({ queryKey: ["lists"], queryFn: getLists });
  const registers = useMemo(
    () => (listsQ.data?.accountRegisters ?? []).filter((r) => !r.isArchived),
    [listsQ.data],
  );
  const register = registers.find((r) => r.id === registerId) ?? null;
  const pockets = useMemo(
    () => registers.filter((r) => r.subAccountRegisterId === registerId),
    [registers, registerId],
  );
  const chipRegisters = useMemo(() => {
    if (!register) return [];
    return [register, ...pockets];
  }, [register, pockets]);

  const entriesQ = useInfiniteQuery({
    queryKey: ["register", registerId, direction],
    queryFn: ({ pageParam }) =>
      getRegisterEntries({
        accountRegisterId: registerId,
        direction,
        skip: pageParam,
        take: PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.skip + lastPage.entries.length : undefined,
    enabled: Number.isFinite(registerId) && registerId > 0,
  });

  const entries = useMemo(
    () => entriesQ.data?.pages.flatMap((page) => page.entries) ?? [],
    [entriesQ.data],
  );
  const lowest90 = entriesQ.data?.pages[0]?.lowestByHorizon?.["90"] ?? null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["register", registerId] });
    void queryClient.invalidateQueries({ queryKey: ["lists"] });
  };

  const clearM = useMutation({
    mutationFn: (input: { entry: RegisterEntry }) =>
      clearEntry({
        registerEntryId: input.entry.id,
        accountRegisterId: registerId,
        isCleared: !input.entry.isCleared,
      }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Failed to update entry"),
  });

  const transferM = useMutation({
    mutationFn: (input: { entry: RegisterEntry; targetId: number }) =>
      applyEntryAsTransfer({
        registerEntryId: input.entry.id,
        accountRegisterId: registerId,
        targetAccountRegisterId: input.targetId,
      }),
    onSuccess: () => {
      setActionError(null);
      setPickingTransferTarget(false);
      invalidate();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Failed to transfer entry"),
  });

  function openMerge(entry: RegisterEntry) {
    router.push({
      pathname: "/merge",
      params: {
        accountRegisterId: String(registerId),
        keepId: entry.id,
        keepLabel: entry.description,
      },
    });
  }

  function openUnmerge() {
    router.push({
      pathname: "/unmerge",
      params: { accountRegisterId: String(registerId) },
    });
  }

  if (!register && !listsQ.isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.empty}>Register not found.</Text>
      </SafeAreaView>
    );
  }

  const actionOptions = actionEntry
    ? [
        ...(actionEntry.isBalanceEntry
          ? []
          : [
              {
                label: actionEntry.isCleared ? "Unclear" : "Clear",
                onPress: () => clearM.mutate({ entry: actionEntry }),
              },
              {
                label: "Transfer to…",
                onPress: () => setPickingTransferTarget(true),
              },
              {
                label: "Merge with…",
                onPress: () => openMerge(actionEntry),
              },
            ]),
        {
          label: "Undo a merge…",
          onPress: () => openUnmerge(),
        },
      ]
    : [];

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title} numberOfLines={1}>
            {register?.name ?? "…"}
          </Text>
          <View style={styles.headerStats}>
            <MoneyText value={num(register?.latestBalance)} style={styles.headerBalance} />
            {lowest90 ? (
              <Text style={styles.headerLowest}>
                Low 90d{" "}
                {formatMoneyShort(num(lowest90.amount))}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* Pocket chips */}
      {chipRegisters.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
          contentContainerStyle={styles.chipsContent}
        >
          {chipRegisters.map((chip) => (
            <Pressable
              key={chip.id}
              style={[styles.chip, chip.id === registerId && styles.chipActive]}
              onPress={() => router.replace(`/register/${chip.id}`)}
            >
              <Text
                style={[
                  styles.chipText,
                  chip.id === registerId && styles.chipTextActive,
                ]}
                numberOfLines={1}
              >
                {chip.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* Direction toggle */}
      <View style={styles.toggle}>
        {(["future", "past"] as const).map((value) => (
          <Pressable
            key={value}
            style={[styles.toggleItem, direction === value && styles.toggleActive]}
            onPress={() => setDirection(value)}
          >
            <Text
              style={[
                styles.toggleText,
                direction === value && styles.toggleTextActive,
              ]}
            >
              {value === "future" ? "Forecast" : "History"}
            </Text>
          </Pressable>
        ))}
      </View>

      {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}

      {/* Entries */}
      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.id}
        refreshControl={
          <RefreshControl
            refreshing={entriesQ.isRefetching}
            onRefresh={() => void entriesQ.refetch()}
            tintColor={colors.textSecondary}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (entriesQ.hasNextPage && !entriesQ.isFetchingNextPage) {
            void entriesQ.fetchNextPage();
          }
        }}
        ListEmptyComponent={
          entriesQ.isLoading ? (
            <ActivityIndicator color={colors.textSecondary} style={styles.loading} />
          ) : (
            <Text style={styles.empty}>No entries.</Text>
          )
        }
        ListFooterComponent={
          entriesQ.isFetchingNextPage ? (
            <ActivityIndicator color={colors.textSecondary} style={styles.loading} />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.entry,
              pressed ? { opacity: 0.7 } : null,
              item.isBalanceEntry ? styles.entryBalanceRow : null,
            ]}
            disabled={item.isBalanceEntry}
            onPress={() => setActionEntry(item)}
          >
            <View style={styles.entryMain}>
              <View style={styles.entryTop}>
                <Text
                  style={[
                    styles.entryDescription,
                    item.isBalanceEntry && styles.entryDescriptionBold,
                  ]}
                  numberOfLines={1}
                >
                  {item.isBalanceEntry ? `⚖ ${item.description}` : item.description}
                </Text>
                {item.isPending && !item.isCleared ? <Badge label="pending" /> : null}
                {item.isProjected ? <Badge label="projected" /> : null}
              </View>
              <Text style={styles.entryDate}>{formatDate(item.createdAt)}</Text>
            </View>
            <View style={styles.entryRight}>
              <MoneyText value={num(item.amount)} style={styles.entryAmount} />
              <MoneyText
                value={num(item.balance)}
                colorize={false}
                style={styles.entryRunning}
              />
            </View>
          </Pressable>
        )}
      />

      {/* Entry action sheet */}
      <ActionSheet
        visible={actionEntry !== null}
        title={actionEntry?.description}
        options={actionOptions}
        onClose={() => setActionEntry(null)}
      />

      {/* Transfer target picker */}
      {pickingTransferTarget ? (
        <RegisterPicker
          registers={registers.filter((r) => r.id !== registerId)}
          value={null}
          onClose={() => setPickingTransferTarget(false)}
          onSelect={(target) => {
            if (actionEntry) {
              transferM.mutate({ entry: actionEntry, targetId: target.id });
              setActionEntry(null);
            }
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function formatMoneyShort(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
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
  headerStats: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  headerBalance: { fontSize: 14, fontWeight: "700" },
  headerLowest: { color: colors.textSecondary, fontSize: 12 },
  chips: { flexGrow: 0 },
  chipsContent: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#1a1a1a" },
  toggle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    margin: spacing.lg,
    marginTop: spacing.sm,
    padding: 2,
  },
  toggleItem: { borderRadius: radius.sm - 2, flex: 1, paddingVertical: spacing.sm },
  toggleActive: { backgroundColor: colors.surfaceAlt },
  toggleText: { color: colors.textSecondary, fontWeight: "600", textAlign: "center" },
  toggleTextActive: { color: colors.text },
  actionError: { color: colors.negative, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  loading: { padding: spacing.xl },
  empty: { color: colors.textSecondary, padding: spacing.xl, textAlign: "center" },
  entry: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  entryBalanceRow: { backgroundColor: colors.surface },
  entryMain: { flex: 1 },
  entryTop: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  entryDescription: { color: colors.text, flexShrink: 1, fontSize: 15 },
  entryDescriptionBold: { fontWeight: "700" },
  entryDate: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  entryRight: { alignItems: "flex-end" },
  entryAmount: { fontSize: 15, fontWeight: "700" },
  entryRunning: { color: colors.textSecondary, fontSize: 12 },
});
