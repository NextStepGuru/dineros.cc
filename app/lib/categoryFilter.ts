import type { Category } from "~/types/types";

/** USelect / USelectMenu value: show all rows (non-empty so Radix Select lists options reliably). */
export const CATEGORY_FILTER_ALL = "__all__";

/** USelect value: rows with no category */
export const CATEGORY_FILTER_UNCATEGORIZED = "__uncategorized__";

/** Parent id → direct child ids (`subCategoryId` edges). */
function childrenByParentId(
  categories: readonly Category[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const c of categories) {
    if (!c.subCategoryId) continue;
    const arr = map.get(c.subCategoryId) ?? [];
    arr.push(c.id);
    map.set(c.subCategoryId, arr);
  }
  return map;
}

/** Selected category id plus all descendants (so choosing a parent includes subcategories). */
export function categoryFilterSubtreeIds(
  rootId: string,
  categories: readonly Category[],
): Set<string> {
  const children = childrenByParentId(categories);
  const ids = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    for (const ch of children.get(id) ?? []) {
      stack.push(ch);
    }
  }
  return ids;
}

export function entryMatchesCategoryFilter(
  categoryId: string | null | undefined,
  filter: string,
  categories?: readonly Category[],
): boolean {
  if (!filter || filter === CATEGORY_FILTER_ALL || filter === "") return true;
  if (filter === CATEGORY_FILTER_UNCATEGORIZED) {
    return categoryId == null || String(categoryId).trim() === "";
  }
  if (categoryId == null || categoryId === "") return false;
  if (!categories?.length) {
    return categoryId === filter;
  }
  const allowed = categoryFilterSubtreeIds(filter, categories);
  return allowed.has(String(categoryId));
}
