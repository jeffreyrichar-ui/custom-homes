import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * Daltile — confirmed product URL pattern (Google search, 2026-05):
 *   https://www.daltile.com/products/<category>/<series>/<color-slug>
 *
 * NOT /product-detail/ as earlier guessed. Common categories:
 *   /products/mosaic/<series>/<color>
 *   /products/floor-and-wall/<series>/<color>
 *
 * Search URL (Optimizely-backed):
 *   https://www.daltile.com/search?text=<query>
 *
 * Matcher accepts both "Daltile" and legacy "Dal" since older portal
 * entries used the short form before normalization.
 */
export const daltileScraper: Scraper = {
  brand: "Daltile",
  matches: (b) => /^(daltile|dal)\b/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://www.daltile.com/search?text=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/products/"][href*="/"]',
      imageSelectors: [
        ".pdp-image-main img",
        ".product-detail-image img",
        ".product-main-image img",
        ".tile-image img",
        "[data-testid='product-image'] img",
        "main img[itemprop='image']",
      ],
      waitMs: 1800,
    });
  },
};
