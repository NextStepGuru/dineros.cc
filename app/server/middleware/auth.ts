import { timingSafeEqual } from "node:crypto";
import {
  defineEventHandler,
  getCookie,
  getHeader,
  getRequestURL,
  setResponseStatus,
  type H3Event,
} from "h3";
import JwtService from "../services/JwtService";
import { prisma } from "~/server/clients/prismaClient";
import { isAdminEmail } from "~/server/lib/adminConfig";

const ignoredRoutes = [
  { type: "exact", path: "/api/logout", method: "POST" },
  { type: "exact", path: "/api/login", method: "POST" },
  { type: "exact", path: "/api/mfa/totp/verify", method: "POST" },
  { type: "exact", path: "/api/mfa/email/send-code", method: "POST" },
  { type: "exact", path: "/api/mfa/email/verify", method: "POST" },
  { type: "exact", path: "/api/mfa/passkey/auth-options", method: "POST" },
  { type: "exact", path: "/api/mfa/passkey/verify", method: "POST" },
  { type: "exact", path: "/api/account-signup", method: "POST" },
  { type: "exact", path: "/api/reset-password-with-code", method: "POST" },
  { type: "exact", path: "/api/forgot-password", method: "POST" },
  { type: "exact", path: "/api/account-invite/validate", method: "GET" },
  { type: "exact", path: "/api/account-invite/accept", method: "POST" },
  { type: "exact", path: "/api/e2e/seed", method: "POST" },
  { type: "exact", path: "/api/e2e/cleanup", method: "POST" },
  { type: "exact", path: "/private/bullmq", method: "GET" },
  { type: "regex", path: /^\/private\/bullmq\/.*/, method: "GET" },
  { type: "regex", path: /^\/api\/public\/.*/, method: "GET" },
  { type: "regex", path: /^\/api\/webhook\/.*/, method: "GET" },
  { type: "regex", path: /^\/api\/webhook\/.*/, method: "POST" },
  { type: "regex", path: /^\/api\/_ah\/.*/, method: "GET" },
  { type: "regex", path: /^\/api\/_nuxt_icon\/.*/, method: "GET" },
];

function isPublicOrIgnoredApiRoute(
  pathname: string,
  method: string | undefined,
): boolean {
  return ignoredRoutes.some((route) => {
    if (route.method !== method) return false;
    if (route.type === "exact") {
      return route.path === pathname;
    }
    if (route.type === "regex" && typeof route.path !== "string") {
      return route.path.test(pathname);
    }
    if (route.type === "regex" && typeof route.path === "string") {
      throw new Error(`Invalid route path type: ${route.path}`);
    }
    return false;
  });
}

function internalRequestTokensMatch(
  supplied: string | undefined,
  expected: string | undefined,
): boolean {
  if (supplied == null || expected == null) return false;
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(
    Buffer.from(supplied, "utf8"),
    Buffer.from(expected, "utf8"),
  );
}

async function forbiddenUnlessAdminForTaskRoute(
  event: H3Event,
  isTaskRoute: boolean,
  userId: number,
): Promise<{ message: string } | null> {
  if (!isTaskRoute) return null;
  const currentUser = (await prisma.user.findUnique({
    where: { id: userId },
  })) as { role?: string | null; email?: string | null } | null;
  const role = typeof currentUser?.role === "string" ? currentUser.role : null;
  const isAdmin = role === "ADMIN" || isAdminEmail(currentUser?.email);
  if (isAdmin) return null;
  setResponseStatus(event, 403);
  return { message: "Forbidden." };
}

export default defineEventHandler(async (event) => {
  const { method } = event.node.req;
  // Use pathname only: req.url includes ?query so e.g. /api/account-invite/validate?token=…
  // would never match ignored "exact" routes and would incorrectly require JWT.
  const pathname = getRequestURL(event).pathname;
  const isTaskRoute = pathname.startsWith("/api/tasks/");

  if (!pathname.startsWith("/api") || isPublicOrIgnoredApiRoute(pathname, method)) {
    return;
  }

  const suppliedInternalToken = getHeader(event, "x-internal-token")?.trim();
  const expectedInternalToken = process.env.INTERNAL_API_TOKEN?.trim();
  const tokensEqual = internalRequestTokensMatch(
    suppliedInternalToken,
    expectedInternalToken,
  );

  if (isTaskRoute && expectedInternalToken && tokensEqual) {
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

    const taskForbidden = await forbiddenUnlessAdminForTaskRoute(
      event,
      isTaskRoute,
      decoded.userId,
    );
    if (taskForbidden) return taskForbidden;
  } catch (error) {
    const isProd = process.env.NODE_ENV === "production";
    setResponseStatus(event, 401);
    if (error instanceof Error && !isProd) {
      return { message: error.message };
    }
    return { message: "Invalid or expired session." };
  }
});
