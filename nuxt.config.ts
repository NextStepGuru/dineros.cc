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

const baseSecurityHeaders = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "content-security-policy":
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: blob: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; connect-src 'self' ws: wss: https:;",
};

export default defineNuxtConfig({
  ssr: true,
  compatibilityDate: "2026-01-31",
  components: true,
  runtimeConfig: {
    public: {
      testDate: process.env.TEST_DATE || "",
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || "https://dineros.cc",
      signupTestPrefill: process.env.NUXT_PUBLIC_SIGNUP_TEST_PREFILL === "1",
      deployEnv:
        process.env.NUXT_PUBLIC_DEPLOY_ENV ||
        process.env.DEPLOY_ENV ||
        "production",
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
        { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
        { rel: "apple-touch-icon", href: "/favicon.ico" },
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
      include: ["zod", "@simplewebauthn/browser"],
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
