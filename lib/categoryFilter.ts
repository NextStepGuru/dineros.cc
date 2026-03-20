/** USelect / USelectMenu value: show all rows (non-empty so Radix Select lists options reliably). */
export const CATEGORY_FILTER_ALL = "__all__";

/** USelect value: rows with no category */
export const CATEGORY_FILTER_UNCATEGORIZED = "__uncategorized__";

export function entryMatchesCategoryFilter(
  categoryId: string | null | undefined,
  filter: string,
): boolean {
  if (!filter || filter === CATEGORY_FILTER_ALL || filter === "") return true;
  if (filter === CATEGORY_FILTER_UNCATEGORIZED) {
    return categoryId == null || String(categoryId).trim() === "";
  }
  return categoryId === filter;
}
