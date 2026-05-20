import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * Florida Tile — US porcelain manufacturer (Lawrenceburg, KY).
 *
 * Confirmed URL patterns (Google search, 2026-05):
 *   Collection landing pages: https://floridatile.com/products/<slug>/
 *     (e.g. /products/ainslee-park/, /products/precious/, /products/alustra/,
 *      /products/indulge/, /products/aventis/, /products/artecrete/)
 *   Site-wide product search: https://floridatile.com/product-search/?keyword=<q>
 *
 * Seed entries reference Florida Tile at the collection level (no per-SKU
 * detail in Tamara's spreadsheets), so the /products/<slug>/ collection page
 * is the right disambiguator — one hero image per series. og:image (added
 * automatically by the playwrightFetch fallback) is the reliable signal.
 *
 * Brand matcher: "Florida Tile" must appear as a discrete token to avoid
 * collisions with "Florida Ainslee" or other vendor-as-brand legacy strings
 * the September 2026 normalization swept up.
 */
export const floridaTileScraper: Scraper = {
  brand: "Florida Tile",
  matches: (b) => /^florida\s+tile\b/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://floridatile.com/product-search/?keyword=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/products/"]',
      imageSelectors: [
        ".product-hero img",
        ".collection-hero img",
        ".product-image img",
        "main img[itemprop='image']",
        "main picture img",
      ],
      waitMs: 1200,
    });
  },
};
