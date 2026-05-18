import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * American Olean — Dal-Tile / Mohawk sub-brand on its own domain.
 *
 * Confirmed URL patterns (Google search, 2026-05):
 *   Product detail: https://www.americanolean.com/products/<category>/<series>/<variant>
 *   Search:         https://www.americanolean.com/search?q=<query>
 *
 * Categories observed: wall, mosaic, concrete-look, marble-look, stone-look,
 * monochromatic-look. Detail pages are the canonical single-variant images.
 *
 * Brand matcher: the seed corpus stores these entries as the bare token
 * "AO" (uppercase), so we must accept that — but "AO" is dangerously short.
 * Anchor on word boundaries on BOTH sides so we don't match "AO Smith Water
 * Heater" or any other "AO<letters>" company name. Also accept the long forms
 * "American Olean" and "americanolean" for entries written out in full.
 */
export const americanOleanScraper: Scraper = {
  brand: "American Olean",
  matches: (b) => {
    const s = b.trim();
    if (/^american\s*olean\b/i.test(s)) return true;
    // Standalone "AO" only — must be the entire token, not a prefix.
    return /^AO$/i.test(s);
  },
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://www.americanolean.com/search?q=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/products/"]',
      imageSelectors: [
        ".product-detail-image img",
        ".product-image img",
        ".pdp-hero img",
        "main img[itemprop='image']",
        "main picture img",
      ],
      waitMs: 1500,
    });
  },
};
