import { defineEventHandler, getRequestURL, setHeader } from "h3";

const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/contact",
  "/terms-of-service",
  "/privacy-policy",
];

export default defineEventHandler((event) => {
  const requestUrl = getRequestURL(event);
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

  const urlsXml = PUBLIC_ROUTES.map((route) => {
    const routePath = route === "/" ? "/" : route;
    return `  <url>\n    <loc>${baseUrl}${routePath}</loc>\n  </url>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlsXml}\n</urlset>`;

  setHeader(event, "content-type", "application/xml; charset=UTF-8");
  return xml;
});
