import { createError, readMultipartFormData } from "h3";
import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { extractStatementFromUpload } from "~/server/services/statementExtractService";
import { prisma } from "~/server/clients/prismaClient";
import { accountWhereUserIsMember } from "~/server/lib/accountAccess";

const MAX_BYTES = 8_000_000;

const fieldsSchema = z.object({
  accountRegisterId: z.coerce.number().int().positive(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const parts = await readMultipartFormData(event);
    if (!parts?.length) {
      throw createError({
        statusCode: 400,
        statusMessage: "Statement file is required.",
      });
    }

    const fields: Record<string, string> = {};
    let fileBuf: Buffer | null = null;
    let filename = "statement.pdf";
    for (const part of parts) {
      if (part.name === "file" && part.data) {
        fileBuf = Buffer.from(part.data);
        filename = part.filename || filename;
      } else if (part.name && part.data) {
        fields[part.name] = part.data.toString("utf8");
      }
    }

    const { accountRegisterId } = fieldsSchema.parse(fields);
    const register = await prisma.accountRegister.findFirst({
      where: {
        id: accountRegisterId,
        account: accountWhereUserIsMember(userId),
      },
      select: { id: true },
    });
    if (!register) {
      throw createError({
        statusCode: 404,
        statusMessage: "Account register not found",
      });
    }

    if (!fileBuf) {
      throw createError({
        statusCode: 400,
        statusMessage: "Statement file is required.",
      });
    }
    if (fileBuf.length > MAX_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: "Statement file is too large (max 8MB).",
      });
    }

    return await extractStatementFromUpload({
      filename,
      buffer: fileBuf,
      userId,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
