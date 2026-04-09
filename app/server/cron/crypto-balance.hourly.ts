import { defineCronHandler } from "#nuxt/cron";
import { log } from "~/server/logger";
import { prisma } from "~/server/clients/prismaClient";
import { dateTimeService } from "~/server/services/forecast";
import { syncWalletPortfolio } from "~/server/services/AlchemyService";

export default defineCronHandler("hourly", async () => {
  const olderThanDate = dateTimeService
    .now()
    .utc()
    .subtract(6, "hours")
    .toDate();

  const registers = await prisma.accountRegister.findMany({
    where: {
      isArchived: false,
      walletAddress: { not: null },
      type: { registerClass: "crypto" },
      OR: [
        { alchemyLastSyncAt: null },
        { alchemyLastSyncAt: { lt: olderThanDate } },
      ],
    },
    select: { id: true },
    take: 50,
  });

  for (const { id } of registers) {
    const result = await syncWalletPortfolio(id);
    if (!result.ok) {
      log({
        message: "Crypto balance cron sync failed",
        level: "warn",
        data: { accountRegisterId: id, result },
      });
    }
  }
});
