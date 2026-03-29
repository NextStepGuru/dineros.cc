// app.config.ts
export default defineAppConfig({
  ui: {
    colors: {
      primary: "emerald",
      neutral: "slate",
    },
    /** Let `<main>` follow content height; document scroll handles overflow (see `.ui-main-scroll` on `body`). */
    main: {
      base: "min-h-0",
    },
  },
});
