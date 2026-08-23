import type { Category } from "@prisma/client";

export function buildCategoryPaths(categories: Category[]): Map<string, string> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  function pathFor(id: string): string {
    const parts: string[] = [];
    let cur: Category | undefined = byId.get(id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.name);
      cur = cur.subCategoryId ? byId.get(cur.subCategoryId) : undefined;
    }
    return parts.join(" / ");
  }
  const map = new Map<string, string>();
  for (const c of categories) {
    map.set(c.id, pathFor(c.id));
  }
  return map;
}
