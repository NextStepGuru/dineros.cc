import { defineEventHandler, setResponseStatus, setCookie } from "h3";
import { getUser } from "../lib/getUser";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import env from "../env";
import { sessionUserFromDb } from "~/server/lib/sessionUserProfile";
import JwtService from "../services/JwtService";
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
      secure: env?.NODE_ENV === "production",
      maxAge: 86400, // 24 hours - match client-side configuration
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });

    setResponseStatus(event, 200);

    return {
      token,
      message: null,
      user: sessionUserFromDb(lookupUser),
    };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
