import { defineCronHandler } from "#nuxt/cron";
import { log } from "~/server/logger";
import { addPlaidBalanceSyncJob } from "~/server/clients/queuesClient";
import { prisma } from "~/prisma/prismaClient";
import moment from "moment";

export default defineCronHandler("hourly", async () => {
  const olderThanDate = moment().utc().subtract({ hours: 6 }).toDate();

  const accountRegisters = await prisma.accountRegister.groupBy({
    _min: {
      id: true,
    },
    by: ["plaidAccessToken"],
    where: {
      isArchived: false,
      plaidAccessToken: {
        not: null,
      },
      OR: [
        { plaidBalanceLastSyncAt: null },
        {
          plaidBalanceLastSyncAt: {
            lt: olderThanDate,
          },
        },
      ],
    },
  });

  accountRegisters.map((accountRegister) => {
    if (accountRegister._min.id) {
      addPlaidBalanceSyncJob({ accountRegisterId: accountRegister._min.id });
      log({
        message: "Plaid accounts synchronized successfully",
        level: "info",
        data: {
          accountRegisterId: accountRegister._min.id,
        },
      });
    }
  });
});
