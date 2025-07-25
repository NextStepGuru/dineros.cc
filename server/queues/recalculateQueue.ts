import type { Job } from "bullmq";
import { ForecastEngineFactory, dateTimeService } from "../services/forecast";
import { log } from "~/server/logger";
import { prisma } from "~/server/clients/prismaClient";

export type RecalculateJob = { accountId: string };
const queueName = "recalculate";

const processor = async (job: Job<RecalculateJob>) => {
  const start = dateTimeService.nowDate().getTime();
  log({
    level: "debug",
    message: `Start RecalculateJob ${job.id} with data:`,
    data: job.data,
  });

  // Use the new ForecastEngine directly
  const engine = ForecastEngineFactory.create(prisma);
  const context = {
    accountId: job.data.accountId,
    startDate: dateTimeService.now().startOf("month").toDate(),
    endDate: dateTimeService.now().add(2, "years").toDate(), // Match original forecast rangelogging: { enabled: false },
  };

  const result = await engine.recalculate(context);

  if (!result.isSuccess) {
    throw new Error(
      `Forecast calculation failed: ${result.errors?.join(", ")}`
    );
  }

  log({
    message: `Completed RecalculateJob ${job.id} in ${
      dateTimeService.nowDate().getTime() - start
    }ms`,
  });
};

export default { queueName, processor };
