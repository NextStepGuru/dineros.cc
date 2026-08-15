import { log } from "~/server/logger";
import { addPlaidBalanceSyncJob } from "~/server/clients/queuesClient";
import { z } from "zod";

export default defineEventHandler(async (event) => {
  const { accountRegisterId } = await getValidatedQuery(
    event,
    z.object({
      accountRegisterId: z.coerce.number().min(1),
    }).parse,
  );

  addPlaidBalanceSyncJob({ accountRegisterId, force: true });

  log({ message: "Plaid accounts synchronized successfully", level: "debug" });

  return true;
});
