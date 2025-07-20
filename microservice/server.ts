import { listen } from "listhen";
import bull from "./lib/bull";
import { createApp, createError, eventHandler, toNodeListener } from "h3";
import fg from "fast-glob";
import env from "./env";

const app = createApp();

(async () => {
  // Load all route files dynamically
  const routes = await fg("./routes/**/*.ts");

  for (const file of routes) {
    const routePath = file.replace(/^\.\/routes\/|\.ts$/g, ""); // Remove prefix & extension
    const [route, method] = routePath.split("."); // Extract route and method (e.g., users.get → /users)

    if (!method || !route) {
      console.warn(`Skipping invalid route file: ${file}`);
      continue;
    }

    const module = await import(`./${file}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler: any = module.default; // Use `any` to bypass type errors

    console.log(`Registering ${method.toUpperCase()} /${route}`);

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

  app.use(bull);

  listen(toNodeListener(app), { port: env.PORT }).then(({ url }) => {
    console.log(`Server running at ${url}`);
  });
})();
