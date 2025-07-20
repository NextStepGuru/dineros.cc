import { defineEventHandler, setResponseStatus, setCookie } from "h3";
import { z } from "zod";
import { publicProfileSchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import env from "../env";
import JwtService from "../services/JwtService";
import { log } from "../logger";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  const user = getUser(event);
  try {
    const lookupUser = await PrismaDb.user.findUniqueOrThrow({
      where: {
        id: user.userId,
      },
    });
    const jwt = new JwtService();
    // Generate JWT token
    const token = await jwt.sign({
      userId: user.userId,
    });

    // Set the token as a cookie
    setCookie(event, "authToken", token, {
      secure: env.NODE_ENV === "production",
      maxAge: 86400, // 24 hours - match client-side configuration
      path: "/",
      sameSite: "lax",
      httpOnly: false, // Allow client-side access
    });

    setResponseStatus(event, 200);

    return {
      token,
      message: null,
      user: publicProfileSchema.parse(lookupUser),
    };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
