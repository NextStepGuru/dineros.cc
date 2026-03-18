import {
  defineEventHandler,
  getHeader,
  getCookie,
  setResponseStatus,
} from "h3";
import JwtService from "../services/JwtService";

const ignoredRoutes = [
  { type: "exact", path: "/api/login", method: "POST" },
  { type: "exact", path: "/api/mfa/totp/verify", method: "POST" },
  { type: "exact", path: "/api/mfa/email/send-code", method: "POST" },
  { type: "exact", path: "/api/mfa/email/verify", method: "POST" },
  { type: "exact", path: "/api/mfa/passkey/auth-options", method: "POST" },
  { type: "exact", path: "/api/mfa/passkey/verify", method: "POST" },
  { type: "exact", path: "/api/account-signup", method: "POST" },
  { type: "exact", path: "/api/reset-password-with-code", method: "POST" },
  { type: "exact", path: "/api/forgot-password", method: "POST" },
  { type: "exact", path: "/private/bullmq", method: "GET" },
  { type: "regex", path: /^\/private\/bullmq\/.*/, method: "GET" },
  { type: "regex", path: /^\/api\/public\/.*/, method: "GET" },
  { type: "regex", path: /^\/api\/webhook\/.*/, method: "GET" },
  { type: "regex", path: /^\/api\/webhook\/.*/, method: "POST" },
  { type: "regex", path: /^\/api\/tasks\/.*/, method: "GET" },
  { type: "regex", path: /^\/api\/tasks\/.*/, method: "POST" },
  { type: "regex", path: /^\/api\/_ah\/.*/, method: "GET" },
  { type: "regex", path: /^\/api\/_nuxt_icon\/.*/, method: "GET" },
];

export default defineEventHandler(async (event) => {
  const { url, method } = event.node.req;

  if (
    !url?.startsWith("/api") ||
    ignoredRoutes.some((route) => {
      if (route.method !== method) return false;
      if (route.type === "exact") {
        return route.path === url;
      } else if (route.type === "regex" && typeof route.path !== "string") {
        return route.path.test(url);
      } else if (route.type === "regex" && typeof route.path === "string") {
        throw new Error(`Invalid route path type: ${route.path}`);
      }
      return false;
    })
  ) {
    return;
  }

  // Check for token in Authorization header
  const authHeader = getHeader(event, "authorization");
  let token = authHeader ? authHeader.split(" ")[1] : null; // Assuming the header is in the format "Bearer <token>"

  // If no token in header, check for token in cookies
  if (!token) {
    token = getCookie(event, "authToken") || null;
  }

  if (!token) {
    setResponseStatus(event, 401);

    return { message: "Token is missing." };
  }

  try {
    const decoded = await new JwtService().verify(token);

    event.context.user = decoded;
  } catch (error) {
    if (error instanceof Error) {
      setResponseStatus(event, 401);
      return { message: error.message };
    }

    setResponseStatus(event, 401);
    return { message: "Invalid token." };
  }
});
