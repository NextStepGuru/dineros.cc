import type { Category } from "~/types/types";

export type CategorySelectItem = {
  id: string;
  name: string;
  value: string;
  label: string;
};

function categoryDropdownLabel(
  catId: string,
  byId: Map<string, Category>,
): string {
  const current = byId.get(catId);
  if (!current) return "";
  if (!current.subCategoryId) return current.name;
  const parent = byId.get(current.subCategoryId);
  return parent ? `${parent.name} › ${current.name}` : current.name;
}

/** Sorted A→Z by display label (e.g. `Parent › Child`) for USelect items. */
export function buildSortedCategorySelectItems(
  categories: Category[],
  accountId: string | null,
): CategorySelectItem[] {
  if (!accountId) return [];
  const all = categories.filter((c) => c.accountId === accountId);
  const byId = new Map(all.map((c) => [c.id, c]));
  return all
    .map((c) => ({
      id: c.id,
      name: c.name,
      value: c.id,
      label: categoryDropdownLabel(c.id, byId),
    }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
}

const nameCmp = (a: Category, b: Category) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/**
 * Manage modal: top-level categories first (A→Z), then their children (A→Z);
 * orphaned children (missing parent in list) last.
 */
export function sortCategoriesForManageList(categories: Category[]): Category[] {
  const roots = categories.filter((c) => !c.subCategoryId).sort(nameCmp);
  const childrenByParent = new Map<string, Category[]>();
  for (const c of categories) {
    if (c.subCategoryId) {
      const arr = childrenByParent.get(c.subCategoryId) ?? [];
      arr.push(c);
      childrenByParent.set(c.subCategoryId, arr);
    }
  }
  for (const arr of childrenByParent.values()) {
    arr.sort(nameCmp);
  }
  const out: Category[] = [];
  const seen = new Set<string>();
  for (const r of roots) {
    out.push(r);
    seen.add(r.id);
    for (const ch of childrenByParent.get(r.id) ?? []) {
      out.push(ch);
      seen.add(ch.id);
    }
  }
  const orphans = categories
    .filter((c) => !seen.has(c.id))
    .sort(nameCmp);
  out.push(...orphans);
  return out;
}
