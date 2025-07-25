import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError } from "h3";
import { log } from "../logger";

export default defineEventHandler(async (event: any) => {
  try {
    log({ message: "Countries API endpoint called", level: "debug" });

    // Use raw SQL query as workaround for type issues
    const countries = (await PrismaDb.$queryRaw`
      SELECT id, name, code, code3
      FROM country
      WHERE is_active = 1
      ORDER BY name ASC
    `) as Array<{
      id: number;
      name: string;
      code: string;
      code3: string;
    }>;

    log({ message: `Returning ${countries.length} countries`, level: "debug" });
    return countries;
  } catch (error) {
    log({ message: "Error in countries API:", data: error, level: "error" });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch countries",
    });
  }
});
