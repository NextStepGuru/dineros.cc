import { log } from "~/server/logger";
import PlaidSyncService from "../../services/PlaidSyncService";

export default defineEventHandler(async () => {
  const plaidSyncService = new PlaidSyncService();

  await plaidSyncService.getAndSyncPlaidAccounts({
    accountRegisterId: 1,
    resetSyncDates: true,
  });

  log({
    message: "Plaid accounts synchronized successfully",
    level: "debug",
  });

  return true;
});
