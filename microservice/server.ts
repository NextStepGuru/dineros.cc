import { listen } from "listhen";
import bull from "./lib/bull";
import { createApp, createError, eventHandler, toNodeListener } from "h3";
import fg from "fast-glob";
import env from "./env";
import { log } from "./logger";

const app = createApp();

(async () => {
  // Load all route files dynamically
  const routes = await fg("./routes/**/*.ts");

  for (const file of routes) {
    const routePath = file.replace(/^\.\/routes\/|\.ts$/g, ""); // Remove prefix & extension
    const [route, method] = routePath.split("."); // Extract route and method (e.g., users.get → /users)

    if (!method || !route) {
      log({ message: `Skipping invalid route file: ${file}`, level: "warn" });
      continue;
    }

    const module = await import(`./${file}`);

    const handler: any = module.default; // Use `any` to bypass type errors

    log({
      message: `Registering ${method.toUpperCase()} /${route}`,
      level: "debug",
    });

    app.use(
      `/${route === "index" ? "" : route}`,
      eventHandler(async (event) => {
        if (event.method?.toLowerCase() !== method) {
          throw createError({ statusCode: 405, message: "Method Not Allowed" });
        }
        return handler(event);
      })
    );
  }

  // Add Bull Board if not in test mode
  if (typeof bull === "function") {
    app.use("/bull", bull);
  } else {
    app.use("/bull", eventHandler(bull));
  }

  listen(toNodeListener(app), { port: env.PORT }).then(({ url }) => {
    log({ message: `Server running at ${url}`, level: "debug" });
  });
})();
