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
    /**
     * Popper-based menus (Select, etc.) must stack above `UModal` (fixed overlay + dialog).
     * Reka copies z-index from the content node onto the popper wrapper; without this, lists render behind modals.
     */
    select: {
      slots: {
        content: "z-[100]",
      },
    },
    selectMenu: {
      slots: {
        content: "z-[100]",
      },
    },
    popover: {
      slots: {
        content: "z-[100]",
      },
    },
    dropdownMenu: {
      slots: {
        content: "z-[100]",
      },
    },
  },
});
