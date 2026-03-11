/**
 * Nitro route for GET /_nuxt (and /_nuxt/) so the framework stops trying to load
 * a generated route file that doesn't exist. Returns 204 No Content.
 */
import { defineEventHandler, setResponseStatus } from "h3";

export default defineEventHandler((event) => {
  setResponseStatus(event, 204);
  return null;
});
