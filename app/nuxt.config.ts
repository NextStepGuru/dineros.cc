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

const isProdDeploy = process.env.NODE_ENV === "production";

const baseSecurityHeaders = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "content-security-policy":
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'self' https://cdn.plaid.com; img-src 'self' data: blob: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:; connect-src 'self' ws: wss: https:;",
  ...(isProdDeploy
    ? {
        "strict-transport-security":
          "max-age=63072000; includeSubDomains; preload",
      }
    : {}),
};

export default defineNuxtConfig({
  ssr: true,
  compatibilityDate: "2026-01-31",
  components: true,
  runtimeConfig: {
    /** Server-only: microservice HTTP base for internal admin actions (reencrypt migrate, etc.). */
    microserviceInternalUrl: process.env.MICROSERVICE_INTERNAL_URL || "",
    public: {
      testDate: process.env.TEST_DATE || "",
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || "https://dineros.cc",
      signupTestPrefill: process.env.NUXT_PUBLIC_SIGNUP_TEST_PREFILL === "1",
      deployEnv:
        process.env.NUXT_PUBLIC_DEPLOY_ENV ||
        process.env.DEPLOY_ENV ||
        "production",
      /** Must match server `ADMIN_EMAIL` for env-based admin to use `/admin` UI. */
      adminEmail: process.env.NUXT_PUBLIC_ADMIN_EMAIL || "",
      /** Optional URL to Bull Board or queue UI (e.g. microservice `/bull`). */
      bullBoardUrl: process.env.NUXT_PUBLIC_BULL_BOARD_URL || "",
      /** Postmark server activity UI base (optional deep-link for operators). */
      postmarkActivityBaseUrl:
        process.env.NUXT_PUBLIC_POSTMARK_ACTIVITY_URL || "",
      /** External log search (e.g. Cloud Logging, Datadog). */
      externalLoggingUrl:
        process.env.NUXT_PUBLIC_EXTERNAL_LOGGING_URL || "",
      /** Runbook or on-call doc. */
      runbookUrl: process.env.NUXT_PUBLIC_RUNBOOK_URL || "",
    },
  },
  devtools: false,
  experimental: {
    payloadExtraction: false,
    defaults: {
      nuxtLink: {
        prefetch: false,
      },
    },
  },
  watchers: {
    chokidar: {
      ignored: watchIgnore,
      usePolling: true,
      followSymlinks: false,
    },
  },
  nitro: {
    ignore: ["**/__tests__/**"],
    typescript: {
      tsConfig: {
        exclude: ["microservice"],
      },
    },
    esbuild: {
      options: { target: "es2022" },
    },

    compressPublicAssets: true,
    routeRules: {
      "/_nuxt/**": {
        headers: {
          "cache-control": "public, max-age=31536000, immutable",
          ...baseSecurityHeaders,
        },
      },
      "/**": {
        headers: {
          "cache-control": "public, max-age=0, must-revalidate",
          ...baseSecurityHeaders,
        },
      },
    },
    watchOptions: {
      ignored: watchIgnore,
      usePolling: true,
      followSymlinks: false,
    },
  },
  app: {
    head: {
      htmlAttrs: {
        lang: "en",
      },
      viewport: "width=device-width, initial-scale=1",
      link: [
        {
          rel: "icon",
          type: "image/png",
          sizes: "32x32",
          href: "https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_32,h_32,f_png/v1737776329/pepe_solo_t0twqk.png",
        },
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: "https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_180,h_180,f_png/v1737776329/pepe_solo_t0twqk.png",
        },
      ],
      meta: [
        {
          property: "og:image",
          content:
            "https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_128/v1737776329/pepe_solo_t0twqk.png",
        },
        {
          name: "twitter:card",
          content: "summary_large_image",
        },
        {
          name: "twitter:image",
          content:
            "https://res.cloudinary.com/guidedsteps/image/upload/c_fill,g_face:auto,w_128/v1737776329/pepe_solo_t0twqk.png",
        },
      ],
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
      include: ["zod", "@simplewebauthn/browser", "@jcss/vue-plaid-link"],
      exclude: ["fsevents"],
    },
  },
  modules: [
    "@nuxt/ui",
    "@pinia/nuxt",
    "@nuxt/image",
    "@nuxt/eslint",
    "@nuxt/test-utils/module",
    "./modules/handle-nuxt-path",
    ...(process.env.NODE_ENV === "test" ? [] : ["nuxt-cron"]),
  ],
  css: ["~/assets/css/main.css"],
  typescript: {
    strict: false,
    typeCheck: false,
    shim: false,
    tsConfig: {
      exclude: ["microservice"],
      // tests/nuxt: Nuxt Vitest project — paths relative to generated .nuxt/tsconfig.json
      include: ["../tests/nuxt/**/*"],
    },
    sharedTsConfig: {
      exclude: ["microservice"],
    },
    nodeTsConfig: {
      exclude: ["microservice"],
    },
  },
  // Only configure cron if not in test mode
  ...(process.env.NODE_ENV !== "test" && {
    cron: {
      runOnInit: false,
      timeZone: "US/Eastern",
      jobsDir: "cron",
    },
  }),
  // Playwright / CI dev server: skip remote font registry fetches (e.g. fonts.bunny.net) that can hang offline runners
  ...(process.env.E2E === "1" && {
    fonts: {
      provider: "local",
    },
  }),
});
