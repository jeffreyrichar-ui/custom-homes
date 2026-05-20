import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * Emser — confirmed product URL pattern (Google search, 2026-05):
 *   https://www.emser.com/product/<series-slug>-<emser-sku>
 *
 * Note: singular "/product/" (not "/products/"). The hyphenated suffix is
 * Emser's internal SKU (e.g. f20viscor1224p = Visconde Oro 12x24 Polished).
 * Collection landing pages live at /products/<series> — those aren't what
 * we want (they don't have a single canonical image).
 *
 * Search URL:
 *   https://www.emser.com/search/?q=<query>
 */
export const emserScraper: Scraper = {
  brand: "Emser",
  matches: (b) => /^emser/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://www.emser.com/search/?q=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      // Prefer the singular /product/<sku> URL (a specific size/finish)
      // over the /products/<series> landing page.
      productLinkSelector: 'a[href*="/product/"]:not([href*="/products/"])',
      imageSelectors: [
        ".product-detail-image img",
        ".product-image img",
        ".pdp-hero img",
        ".product-photo img",
        "main img[itemprop='image']",
        "main picture img",
      ],
      waitMs: 1500,
    });
  },
};
