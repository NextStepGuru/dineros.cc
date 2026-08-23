// app.config.ts
export default defineAppConfig({
  ui: {
    colors: {
      primary: "navy",
      secondary: "gold",
      neutral: "slate",
      success: "emerald",
      warning: "amber",
      error: "rose",
      info: "sky",
    },
    /** Let `<main>` follow content height; document scroll handles overflow (see `.ui-main-scroll` on `body`). */
    main: {
      base: "min-h-0",
    },
    button: {
      defaultVariants: {
        color: "primary",
      },
      slots: {
        base: "font-medium",
      },
    },
    card: {
      slots: {
        root: "rounded-lg ring-1 ring-default bg-default shadow-sm",
      },
    },
    badge: {
      slots: {
        base: "font-medium",
      },
    },
    alert: {
      slots: {
        root: "rounded-lg",
      },
    },
    modal: {
      slots: {
        content: "rounded-lg shadow-xl",
      },
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
