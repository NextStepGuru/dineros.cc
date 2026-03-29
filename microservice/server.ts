import { listen } from "listhen";
import bull from "./lib/bull";
import {
  createApp,
  createError,
  eventHandler,
  getHeader,
  toNodeListener,
  type H3Event,
} from "h3";
import fg from "fast-glob";
import env from "./env";
import { log } from "./logger";

const app = createApp();

app.use(
  eventHandler((event) => {
    const expectedInternalToken = env.INTERNAL_API_TOKEN?.trim();
    if (!expectedInternalToken) {
      throw createError({
        statusCode: 503,
        statusMessage: "Internal API token is not configured",
      });
    }

    const suppliedInternalToken = getHeader(event, "x-internal-token")?.trim();
    if (suppliedInternalToken !== expectedInternalToken) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized",
      });
    }
  }),
);

// Load all route files dynamically. One path (e.g. /migrate) may have both .get and .post files;
// registering them as stacked middlewares breaks method routing because the first handler runs
// for every request and throws 405 when the method does not match (e.g. GET registered before POST).
const routes = await fg("./routes/**/*.ts");

const handlersByRoute = new Map<
  string,
  Map<string, (event: H3Event) => unknown>
>();

for (const file of routes) {
  const routePath = file
    .replaceAll("./routes/", "")
    .replaceAll(".ts", ""); // Remove prefix & extension
  const [route, method] = routePath.split("."); // Extract route and method (e.g., users.get → /users)

  if (!method || !route) {
    log({ message: `Skipping invalid route file: ${file}`, level: "warn" });
    continue;
  }

  const module = await import(`./${file}`);
  const handler: (event: unknown) => unknown = module.default;

  if (!handlersByRoute.has(route)) {
    handlersByRoute.set(route, new Map());
  }
  const methods = handlersByRoute.get(route)!;
  if (methods.has(method)) {
    log({
      message: `Duplicate handler ${method.toUpperCase()} for /${route}, skipping ${file}`,
      level: "warn",
    });
    continue;
  }
  methods.set(method, handler);

  log({
    message: `Loaded ${method.toUpperCase()} /${route} from ${file}`,
    level: "debug",
  });
}

for (const [route, methods] of handlersByRoute) {
  const path = `/${route === "index" ? "" : route}`;
  const methodList = [...methods.keys()].join(", ").toUpperCase();
  log({
    message: `Registering ${path} → [${methodList}]`,
    level: "debug",
  });

  app.use(
    path,
    eventHandler(async (event) => {
      const m = event.method?.toLowerCase() ?? "";
      const handler = methods.get(m);
      if (!handler) {
        throw createError({
          statusCode: 405,
          statusMessage: "Method Not Allowed",
        });
      }
      return handler(event);
    }),
  );
}

// Add Bull Board if not in test mode
if (typeof bull === "function") {
  app.use("/bull", bull);
} else {
  app.use("/bull", eventHandler(bull));
}

const { url } = await listen(toNodeListener(app), { port: env.PORT });
log({ message: `Server running at ${url}`, level: "debug" });
