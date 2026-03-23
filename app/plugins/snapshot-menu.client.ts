export default defineNuxtPlugin(() => {
  const listStore = useListStore();
  const snapshotMode = useSnapshotMode();
  snapshotMode.initSnapshotMenuSync(() => {
    return (
      listStore.getAccountRegisters[0]?.accountId ??
      listStore.getAccounts?.[0]?.id ??
      undefined
    );
  });
});
