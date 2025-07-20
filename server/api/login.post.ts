import speakeasy from "speakeasy";
import { defineEventHandler, readBody, setResponseStatus, setCookie } from "h3";
import { z } from "zod";
import {
  loginSchema,
  privateUserSchema,
  publicProfileSchema,
} from "~/schema/zod";
import env from "../env";
import HashService from "../services/HashService";
import JwtService from "../services/JwtService";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { log } from "../logger";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  try {
    // Read and validate request body
    const body = await readBody(event);
    const { email, password, tokenChallenge } = loginSchema
      .extend({
        tokenChallenge: z.string().optional(),
      })
      .parse(body);

    // Find user by email
    const lookup = await PrismaDb.user.findFirst({
      where: { email },
    });

    if (!lookup) {
      setResponseStatus(event, 401);
      return { errors: "Invalid email or password." };
    }

    const user = privateUserSchema.parse(lookup);

    if (!user || !user.password) {
      setResponseStatus(event, 401);
      return { errors: "Invalid email or password." };
    }

    // Validate the password
    const isPasswordValid = await new HashService().verify(
      user.password,
      password
    );
    if (!isPasswordValid) {
      setResponseStatus(event, 401);
      return { errors: "Invalid email or password." };
    }

    if (
      user.settings.speakeasy.isEnabled &&
      user.settings.speakeasy.isVerified &&
      user.settings.speakeasy.base32secret &&
      !tokenChallenge
    ) {
      setResponseStatus(event, 200);
      return { twoFactorChallengeRequired: true };
    } else if (
      user.settings.speakeasy.isEnabled &&
      user.settings.speakeasy.isVerified &&
      user.settings.speakeasy.base32secret &&
      tokenChallenge
    ) {
      const results = speakeasy.totp.verify({
        secret: user.settings.speakeasy.base32secret,
        encoding: "base32",
        token: tokenChallenge,
        window: 10,
      });

      if (!results) {
        setResponseStatus(event, 401);
        return { errors: "Invalid two-factor authentication token." };
      }
    }

    const jwt = new JwtService();
    // Generate JWT token
    const token = await jwt.sign({ userId: user.id });

    await PrismaDb.user.update({
      where: { id: user.id },
      data: { lastAccessedAt: new Date() },
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
    return { token, message: null, user: publicProfileSchema.parse(user) };
  } catch (error) {
    // Log the actual error for debugging
    log({
      message: "Login error details",
      data: error,
      level: "error"
    });

    handleApiError(error);

    // Re-throw with more context
    throw new Error(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});
