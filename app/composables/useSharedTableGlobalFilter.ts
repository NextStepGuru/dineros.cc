/**
 * Single session-wide text filter for table toolbars so the filter row stays
 * meaningful when navigating between register, accounts, goals, reoccurrences, etc.
 */
export function useSharedTableGlobalFilter() {
  return useState("dineros-table-global-filter", () => "");
}
