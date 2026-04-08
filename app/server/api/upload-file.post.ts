import { getUser } from "../lib/getUser";
import {
  createError,
  defineEventHandler,
  readMultipartFormData,
  type H3Event,
} from "h3";
import papaparse from "papaparse"; // Import papaparse
import { z } from "zod";
import { prisma } from "../clients/prismaClient";
import { createId as cuid2 } from "@paralleldrive/cuid2";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast";

type CsvRow = {
  Date: string;
  Description: string;
  Amount: string;
  Note: string;
  "Check Number": string;
  Category: string;
};

async function resolveUploadAccountId(
  accountRegisterId: number,
  userId: number,
): Promise<string> {
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
  return register.accountId;
}

async function importRegisterRowsFromCsv(params: {
  userId: number;
  accountRegisterId: number;
  fileData: string;
}): Promise<void> {
  const { userId, accountRegisterId, fileData } = params;

  if (fileData.length > 2_000_000) {
    throw createError({
      statusCode: 413,
      statusMessage: "CSV file too large",
    });
  }

  const accountId = await resolveUploadAccountId(accountRegisterId, userId);

  const csvData = papaparse.parse<CsvRow>(fileData, {
    header: true,
  });

  if (csvData.data.length > 5000) {
    throw createError({
      statusCode: 400,
      statusMessage: "Too many rows (max 5000)",
    });
  }

  const parseAmountCell = (cell: string) =>
    Number.parseFloat(cell.replaceAll("$", "").replaceAll(",", ""));

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
    const amount = parseAmountCell(item.Amount);
    const description = item.Description;
    const categoryName = item.Category?.trim() || null;

    return { createdAt, amount, description, categoryName };
  });

  const filtered = await Promise.all(
    results.map(async (item) => {
      const lookup = await prisma.registerEntry.findFirst({
        where: {
          accountRegisterId,
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

  if (!filteredResults.length) return;

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

export default defineEventHandler(async (event: H3Event) => {
  try {
    const { userId } = getUser(event);
    const multiPartFormData = await readMultipartFormData(event);

    if (multiPartFormData) {
      const structuredData: Record<string, string> = {};
      for (const part of multiPartFormData) {
        if (part.name) {
          structuredData[part.name] = part.data.toString("utf-8");
        }
      }

      const uploadFileSchema = z.object({
        accountRegisterId: z.coerce.number().min(1),
        fileData: z.string().max(2_000_000),
      });

      const { accountRegisterId, fileData } =
        uploadFileSchema.parse(structuredData);

      await importRegisterRowsFromCsv({
        userId,
        accountRegisterId,
        fileData,
      });
    }

    return userId;
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
