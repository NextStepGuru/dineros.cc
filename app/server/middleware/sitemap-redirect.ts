import { defineEventHandler, getRequestURL, sendRedirect } from "h3";

const SITEMAP_ALIASES = new Set([
  "sitemap_index",
  "sitemap1",
  "sitemaps",
  "sitemap-index",
  "post-sitemap",
  "page-sitemap",
  "news-sitemap",
]);

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname;
  if (!pathname.endsWith(".xml")) return;

  const alias = pathname.slice(1, -4); // strip leading / and trailing .xml
  if (SITEMAP_ALIASES.has(alias)) {
    return sendRedirect(event, "/sitemap.xml", 301);
  }
});
