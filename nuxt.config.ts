const watchIgnore = [
  "**/node_modules/**",
  "**/microservice/**",
  "**/client/**",
  "**/.git/**",
  "**/dist/**",
  "**/.nuxt/**",
  "**/.output/**",
  "**/prisma/**",
  "**/tests/**",
  "**/.pnpm/**",
];

export default defineNuxtConfig({
  compatibilityDate: "2026-01-31",
  components: true,
  devtools: { enabled: process.env.DEPLOY_ENV === "local", vscode: {} },
  watchers: {
    chokidar: {
      ignored: watchIgnore,
      usePolling: true,
      followSymlinks: false,
    },
  },
  nitro: {
    watchOptions: {
      ignored: watchIgnore,
      usePolling: true,
      followSymlinks: false,
    },
  },
  app: {
    head: {
      viewport:
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
    },
  },
  vite: {
    server: {
      watch: {
        ignored: watchIgnore,
        usePolling: true,
        followSymlinks: false,
      },
      hmr: {
        overlay: false,
      },
    },
    optimizeDeps: {
      exclude: ["fsevents"],
    },
  },
  modules: [
    "@nuxt/ui-pro",
    "@pinia/nuxt",
    "@nuxt/image",
    "@nuxt/eslint",
    // Only include nuxt-cron if not in test mode
    ...(process.env.NODE_ENV !== "test" ? ["nuxt-cron"] : []),
  ],
  css: ["~/assets/css/main.css"],
  typescript: {
    strict: false,
    typeCheck: false,
    shim: false,
  },
  uiPro: {
    license: process.env.NUXT_UI_PRO_LICENSE || "",
  },
  // Only configure cron if not in test mode
  ...(process.env.NODE_ENV !== "test" && {
    cron: {
      runOnInit: false,
      timeZone: "US/Eastern",
      jobsDir: "cron",
    },
  }),
});
