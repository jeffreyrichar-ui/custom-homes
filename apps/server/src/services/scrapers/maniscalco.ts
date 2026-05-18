import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * Maniscalco — US tile importer/distributor (Maniscalco Stone).
 *
 * Confirmed URL patterns (Google search, 2026-05):
 *   Product detail:        https://www.maniscalcostone.com/product/<slug>/
 *     (e.g. /product/chh11tl/, /product/chp34tl/, /product/copper-antique-1x1/)
 *   Series/material index: /products-by-series/, /products-by-material/
 *
 * Note the canonical host is maniscalcostone.com (not maniscalcotile.com —
 * the legacy company name was Maniscalco Tile Co., now Maniscalco Stone).
 * The site is a WordPress build, so the default ?s= search works. Seed
 * entries reference Chameleon and similar series; the /product/<slug>/
 * detail page gives a single hero image per SKU. og:image fallback in
 * playwrightFetch covers the cases where selectors miss.
 *
 * Brand matcher: anchor on word boundary so "Maniscalco" / "Maniscalco Stone"
 * / "Maniscalco Tile" all match, but unrelated prefixes do not.
 */
export const maniscalcoScraper: Scraper = {
  brand: "Maniscalco",
  matches: (b) => /^maniscalco\b/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://www.maniscalcostone.com/?s=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/product/"]',
      imageSelectors: [
        ".product-image img",
        ".product-gallery img",
        ".wp-post-image",
        "main img[itemprop='image']",
        "main picture img",
      ],
      waitMs: 1200,
    });
  },
};
