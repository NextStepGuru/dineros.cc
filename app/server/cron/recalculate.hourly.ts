import { defineCronHandler } from "#nuxt/cron";
import { prisma } from "../clients/prismaClient";
import { addRecalculateJob } from "../clients/queuesClient";
import { log } from "~/server/logger";

const cronTime = () => "0 * * * *";

export default defineCronHandler(cronTime, async () => {
  const accounts = await prisma.account.findMany({
    where: {
      isArchived: false,
      registers: {
        some: {
          isArchived: false,
          entries: {
            some: {
              hasBalanceReCalc: true,
            },
          },
        },
      },
    },
    select: {
      id: true,
    },
  });

  log({ message: "Starting linear budget recalculations", data: { accounts } });

  for (const { id: accountId } of accounts) {
    addRecalculateJob({ accountId });
  }

  log({ message: "Linear budget recalculations completed" });
});
