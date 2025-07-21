import { prisma as PrismaDb } from "~/server/clients/prismaClient";

export default defineEventHandler(async (event: any) => {
  try {
    console.log("Countries API endpoint called");

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

    console.log(`Returning ${countries.length} countries`);
    return countries;
  } catch (error) {
    console.error("Error in countries API:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch countries",
    });
  }
});
