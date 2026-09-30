import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getForecastBalances, getLists } from "@/api/endpoints";
import type { AccountRegister } from "@/api/types";
import { Badge } from "@/components/Badge";
import { MoneyText } from "@/components/MoneyText";
import { colors, radius, spacing } from "@/constants/theme";
import { num } from "@/lib/money";

type Row = {
  register: AccountRegister;
  parent: AccountRegister | null;
};

function uniqueRegisterPairs(registers: AccountRegister[]) {
  const pairs = new Map<string, { accountId: string; budgetId: number }>();
  for (const r of registers) {
    if (!pairs.has(r.accountId)) {
      pairs.set(r.accountId, { accountId: r.accountId, budgetId: r.budgetId });
    }
  }
  return [...pairs.values()];
}

export default function AccountsScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const listsQ = useQuery({ queryKey: ["lists"], queryFn: getLists });

  const registers = useMemo(
    () => (listsQ.data?.accountRegisters ?? []).filter((r) => !r.isArchived),
    [listsQ.data],
  );

  const pairs = useMemo(() => uniqueRegisterPairs(registers), [registers]);
  const pairsKey = pairs.map((p) => `${p.accountId}:${p.budgetId}`).join(",");

  const forecastQ = useQuery({
    queryKey: ["forecast-balances", pairsKey],
    queryFn: async () => {
      const results = await Promise.all(
        pairs.map((p) =>
          getForecastBalances({
            accountId: p.accountId,
            budgetId: p.budgetId,
            monthsAhead: 1,
          }).catch(() => ({ balances: {}, asOf: "" })),
        ),
      );
      const balances: Record<string, number> = {};
      for (const result of results) {
        Object.assign(balances, result.balances);
      }
      return balances;
    },
    enabled: pairs.length > 0,
  });

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of listsQ.data?.accounts ?? []) {
      map.set(account.id, account.name);
    }
    return map;
  }, [listsQ.data]);

  const sections = useMemo(() => {
    const byId = new Map(registers.map((r) => [r.id, r] as const));
    const parents = registers.filter((r) => !r.subAccountRegisterId);
    return parents.map((parent) => ({
      key: String(parent.id),
      title:
        accountNameById.get(parent.accountId) ?? parent.name,
      data: [
        { register: parent, parent: null },
        ...registers
          .filter((r) => r.subAccountRegisterId === parent.id)
          .map((r): Row => ({ register: r, parent: byId.get(r.subAccountRegisterId!) ?? null })),
      ],
    }));
  }, [registers, accountNameById]);

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([listsQ.refetch(), forecastQ.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sections}
        keyExtractor={(section) => section.key}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void refresh();
            }}
            tintColor={colors.textSecondary}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Forecast</Text>
            <Pressable onPress={() => router.push("/transfer")}>
              <Text style={styles.newTransfer}>+ New transfer</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item: section }) => (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.data.map((row) => {
              const forecast = forecastQ.data?.[String(row.register.id)];
              return (
                <Pressable
                  key={row.register.id}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.row,
                    row.register.subAccountRegisterId ? styles.pocketRow : null,
                    pressed ? { opacity: 0.7 } : null,
                  ]}
                  onPress={() =>
                    router.push(`/register/${row.register.id}`)
                  }
                >
                  <View style={styles.rowText}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {row.register.name}
                      </Text>
                      {row.register.subAccountRegisterId ? (
                        <Badge label="pocket" />
                      ) : null}
                    </View>
                    <Text style={styles.forecastLabel}>
                      {forecast !== undefined
                        ? "Forecast (1 mo)"
                        : "Balance"}
                    </Text>
                  </View>
                  <View style={styles.right}>
                    <MoneyText
                      value={
                        forecast !== undefined
                          ? forecast
                          : num(row.register.latestBalance)
                      }
                      colorize={forecast === undefined}
                      style={styles.balance}
                    />
                    {forecast !== undefined ? (
                      <MoneyText
                        value={num(row.register.latestBalance)}
                        style={styles.balanceNow}
                      />
                    ) : null}
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        ListEmptyComponent={
          listsQ.isLoading ? null : (
            <Text style={styles.empty}>No account registers found.</Text>
          )
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: spacing.xl },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: "800" },
  newTransfer: { color: colors.accent, fontSize: 15, fontWeight: "700" },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
  },
  row: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  pocketRow: { marginLeft: spacing.lg, backgroundColor: colors.surfaceAlt },
  rowText: { flex: 1 },
  nameRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  name: { color: colors.text, flexShrink: 1, fontSize: 16, fontWeight: "600" },
  forecastLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  right: { alignItems: "flex-end" },
  balance: { fontSize: 16, fontWeight: "700" },
  balanceNow: { color: colors.textSecondary, fontSize: 12 },
  chevron: { color: colors.textSecondary, fontSize: 22 },
  empty: { color: colors.textSecondary, padding: spacing.xl, textAlign: "center" },
});
