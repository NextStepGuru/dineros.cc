import { defineCronHandler } from "#nuxt/cron";
import { log } from "~/server/logger";
import { addPlaidBalanceSyncJob } from "~/server/clients/queuesClient";
import { prisma } from "~/server/clients/prismaClient";
import { dateTimeService } from "~/server/services/forecast";

export default defineCronHandler("hourly", async () => {
  const olderThanDate = dateTimeService
    .now()
    .utc()
    .subtract(6, "hours")
    .toDate();

  const accountRegisters = await prisma.accountRegister.findMany({
    where: {
      isArchived: false,
      plaidAccessToken: { not: null },
      plaidId: { not: null },
      OR: [
        { plaidBalanceLastSyncAt: null },
        { plaidBalanceLastSyncAt: { lt: olderThanDate } },
      ],
    },
    select: { id: true, plaidAccessToken: true },
  });

  const oneRegisterIdPerToken = new Map<string, number>();
  for (const ar of accountRegisters) {
    const token = ar.plaidAccessToken;
    if (token && !oneRegisterIdPerToken.has(token)) {
      oneRegisterIdPerToken.set(token, ar.id);
    }
  }

  for (const accountRegisterId of oneRegisterIdPerToken.values()) {
    addPlaidBalanceSyncJob({ accountRegisterId });
    log({
      message: "Plaid balance sync job enqueued",
      level: "info",
      data: { accountRegisterId },
    });
  }
});
