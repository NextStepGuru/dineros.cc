import { getUser } from "../lib/getUser";
import type { H3Event } from "h3";
import papaparse from "papaparse"; // Import papaparse
import { z } from "zod";
import { prisma } from "../clients/prismaClient";
import { createId as cuid2 } from "@paralleldrive/cuid2";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const { userId } = getUser(event);
    const multiPartFormData = await readMultipartFormData(event);

    if (multiPartFormData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const structuredData: Record<string, any> = {};
      for (const part of multiPartFormData) {
        if (part.name) {
          // structuredData[part.name] = part.data;
          structuredData[part.name] = part.data.toString("utf-8");
        }
      }

      const uploadFileSchema = z.object({
        accountRegisterId: z.coerce.number().min(1),
        fileData: z.string(),
      });

      const { accountRegisterId, fileData } =
        uploadFileSchema.parse(structuredData);

      const csvData = papaparse.parse<{
        Date: string;
        Description: string;
        Amount: string;
        Note: string;
        "Check Number": string;
        Category: string;
      }>(fileData, {
        header: true,
      });

      const results = csvData.data.map((item) => {
        const createdAt = dateTimeService
          .createUTC(item.Date)
          .set({
            hour: 0,
            minute: 0,
            second: 0,
            milliseconds: 0,
          })
          .toDate();
        const amount = parseFloat(
          item.Amount.replace("$", "").replace(",", "")
        );
        const description = item.Description;

        return { createdAt, amount, description };
      });

      const filtered = await Promise.all(
        results.map(async (item) => {
          const lookup = await prisma.registerEntry.findFirst({
            where: {
              amount: item.amount,
              createdAt: {
                gte: dateTimeService
                  .createUTC(item.createdAt)
                  .set({
                    hour: 0,
                    minute: 0,
                    second: 0,
                    milliseconds: 0,
                  })
                  .subtract({ day: 2 })
                  .toDate(),
                lte: dateTimeService
                  .createUTC(item.createdAt)
                  .set({
                    hour: 0,
                    minute: 0,
                    second: 0,
                    milliseconds: 0,
                  })
                  .add({ day: 2 })
                  .toDate(),
              },
            },
          });

          return !lookup;
        })
      );

      const filteredResults = results.filter((_, index) => filtered[index]);

      if (filteredResults.length) {
        await prisma.registerEntry.createMany({
          data: filteredResults.map((item) => ({
            id: cuid2(),
            accountRegisterId,
            createdAt: item.createdAt,
            description: item.description,
            amount: item.amount,
            balance: item.amount,
            isCleared: true,
            isProjected: false,
          })),
        });
      }
    }

    return userId;
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
