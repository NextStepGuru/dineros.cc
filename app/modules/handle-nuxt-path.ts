/**
 * Dev-only: handle GET /_nuxt/ (no filename) to avoid 404 request error.
 * The Nuxt/Vite dev server returns 404 for this path before Nitro runs;
 * addDevServerHandler registers a handler that is checked before the 404 (see nuxt#31646).
 */
import { defineEventHandler, setResponseStatus } from "h3";
import { addDevServerHandler, defineNuxtModule } from "@nuxt/kit";

export default defineNuxtModule({
  meta: { name: "handle-nuxt-path" },
  setup() {
    addDevServerHandler({
      route: "/_nuxt/",
      handler: defineEventHandler((event) => {
        const path = event.path || event.node?.req?.url || "";
        if (path === "/_nuxt" || path === "/_nuxt/") {
          setResponseStatus(event, 204);
          return null;
        }
        // Let other handlers run (e.g. asset serving)
        return undefined;
      }),
    });
    addDevServerHandler({
      route: "/_nuxt",
      handler: defineEventHandler((event) => {
        setResponseStatus(event, 204);
        return null;
      }),
    });
  },
});
