import type { Ref } from "vue";

type SnapshotItem = {
  label: string;
  value: string | number | null;
};

export function useSnapshotMenuItems(args: {
  selectedSnapshotValue: Ref<string | number | null>;
  snapshotViewItems: Ref<SnapshotItem[]>;
}) {
  const selectedSnapshotLabel = computed(
    () =>
      args.snapshotViewItems.value.find(
        (item) => item.value === args.selectedSnapshotValue.value,
      )?.label ?? "Live",
  );

  const snapshotMenuItems = computed(() => [
    args.snapshotViewItems.value.map((item) => ({
      label: item.label,
      icon:
        args.selectedSnapshotValue.value === item.value
          ? "i-lucide-check"
          : "i-lucide-circle",
      onSelect: () => {
        args.selectedSnapshotValue.value = item.value;
      },
    })),
  ]);

  return {
    selectedSnapshotLabel,
    snapshotMenuItems,
  };
}
