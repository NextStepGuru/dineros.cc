/**
 * Single dark palette matching the web app's navy/gold money styling.
 * The app is dark-only to keep the UI layer minimal.
 */
export const colors = {
  background: "#0b1220",
  surface: "#121c2f",
  surfaceAlt: "#182438",
  border: "#22314b",
  text: "#f5f7fa",
  textSecondary: "#8a94a6",
  positive: "#34d399",
  negative: "#f87171",
  accent: "#f5b700",
  danger: "#ef4444",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
} as const;
