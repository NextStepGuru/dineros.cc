import { defineEventHandler, deleteCookie } from "h3";

/** Clears httpOnly session cookie (client cannot clear it from JS). */
export default defineEventHandler((event) => {
  deleteCookie(event, "authToken", { path: "/" });
  return { ok: true };
});
