import { prisma } from "~/prisma/prismaClient";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { log } from "~/server/logger";

export default defineEventHandler(async () => {
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

  log({ message: "Recalculating balances for all active accounts" });
  for (const { id: accountId } of accounts) {
    addRecalculateJob({
      accountId,
    });
    log({
      message: "Linear budget recalculations scheduled",
      data: { accountId },
    });
  }

  return true;
});
