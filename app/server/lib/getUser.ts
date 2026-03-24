import type { EventHandlerRequest, H3Event } from "h3";
import { createError } from "h3";

export const getUser = (event: H3Event<EventHandlerRequest>) => {
  if (!event.context?.user) {
    throw createError({
      statusMessage: "User not found in context",
      statusCode: 401,
    });
  }
  const user = event.context.user as {
    userId: number;
    jwtKey: string;
    iat: number;
    exp: number;
  };

  return user;
};
