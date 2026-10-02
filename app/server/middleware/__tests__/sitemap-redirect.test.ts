import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: unknown) => handler);
});

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler: unknown) => handler),
  getRequestURL: vi.fn(),
  sendRedirect: vi.fn(),
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import sitemapRedirect from "../sitemap-redirect";
// eslint-disable-next-line import/first -- mocks must be registered first
import { getRequestURL, sendRedirect } from "h3";

function eventForPath(pathname: string) {
  (getRequestURL as any).mockReturnValue(new URL(`https://dineros.cc${pathname}`));
  return { node: { req: { url: pathname } } };
}

describe("sitemap-redirect middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    "/sitemap_index.xml",
    "/sitemap1.xml",
    "/sitemaps.xml",
    "/sitemap-index.xml",
    "/post-sitemap.xml",
    "/page-sitemap.xml",
    "/news-sitemap.xml",
  ])("redirects legacy alias %s to /sitemap.xml with 301", async (pathname) => {
    const event = eventForPath(pathname);
    (sendRedirect as any).mockReturnValue("redirected");

    const result = await sitemapRedirect(event);

    expect(sendRedirect).toHaveBeenCalledWith(event, "/sitemap.xml", 301);
    expect(result).toBe("redirected");
  });

  it("passes through non-sitemap .xml paths", async () => {
    const event = eventForPath("/some-other.xml");

    const result = await sitemapRedirect(event);

    expect(sendRedirect).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("passes through paths that are not .xml", async () => {
    const event = eventForPath("/sitemap_index");

    await sitemapRedirect(event);

    expect(sendRedirect).not.toHaveBeenCalled();
  });

  it("does not redirect an alias with extra segments", async () => {
    const event = eventForPath("/nested/sitemap_index.xml");

    await sitemapRedirect(event);

    expect(sendRedirect).not.toHaveBeenCalled();
  });
});
