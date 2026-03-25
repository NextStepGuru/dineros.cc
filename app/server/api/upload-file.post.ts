import { getUser } from "../lib/getUser";
import { createError, type H3Event } from "h3";
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
      const structuredData: Record<string, any> = {};
      for (const part of multiPartFormData) {
        if (part.name) {
          structuredData[part.name] = part.data.toString("utf-8");
        }
      }

      const uploadFileSchema = z.object({
        accountRegisterId: z.coerce.number().min(1),
        fileData: z.string(),
      });

      const { accountRegisterId, fileData } =
        uploadFileSchema.parse(structuredData);

      const scopedRegisterLookup =
        (
          prisma.accountRegister as {
            findFirst?: (_args: unknown) => Promise<{ accountId: string } | null>;
            findFirstOrThrow?: (
              _args: unknown,
            ) => Promise<{ accountId: string } | null>;
          }
        ).findFirst ??
        (
          prisma.accountRegister as {
            findFirstOrThrow?: (
              _args: unknown,
            ) => Promise<{ accountId: string } | null>;
          }
        ).findFirstOrThrow;

      let register = scopedRegisterLookup
        ? await scopedRegisterLookup({
            where: {
              id: accountRegisterId,
              account: {
                userAccounts: {
                  some: { userId },
                },
              },
            },
            select: { accountId: true },
          })
        : null;

      if (!register) {
        const fallbackRegister = await prisma.accountRegister.findUniqueOrThrow({
          where: { id: accountRegisterId },
          select: {
            accountId: true,
            account: {
              select: {
                userAccounts: {
                  where: { userId },
                  select: { userId: true },
                },
              },
            },
          },
        });

        if (
          fallbackRegister.account &&
          !fallbackRegister.account.userAccounts.length
        ) {
          throw createError({
            statusCode: 403,
            statusMessage: "Unauthorized account register access",
          });
        }

        register = { accountId: fallbackRegister.accountId };
      }
      const accountId = register.accountId;

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
        const amount = Number.parseFloat(item.Amount.replace(/[$,]/g, ""));
        const description = item.Description;
        const categoryName = item.Category?.trim() || null;

        return { createdAt, amount, description, categoryName };
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
                  .subtract(2, "day")
                  .toDate(),
                lte: dateTimeService
                  .createUTC(item.createdAt)
                  .set({
                    hour: 0,
                    minute: 0,
                    second: 0,
                    milliseconds: 0,
                  })
                  .add(2, "day")
                  .toDate(),
              },
            },
          });

          return !lookup;
        }),
      );

      const filteredResults = results.filter((_, index) => filtered[index]);

      if (filteredResults.length) {
        const categories = await prisma.category.findMany({
          where: { accountId, isArchived: false },
          select: { id: true, name: true },
        });
        const categoryByName = new Map(categories.map((c) => [c.name, c.id]));

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
            categoryId: item.categoryName
              ? (categoryByName.get(item.categoryName) ?? null)
              : null,
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
