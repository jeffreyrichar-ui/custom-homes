import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * Sartoria — Italian artisan tile brand under the Terratinta Group.
 *
 * Confirmed URL patterns (Google search, 2026-05):
 *   Brand landing:    https://www.terratintagroup.com/sartoria/
 *   Collection pages: https://www.terratintagroup.com/collections/<slug>/
 *     (e.g. /collections/materici/, /collections/tbrik/, /collections/pulse/,
 *      /collections/tint/, /collections/decorata/, /collections/tsquare/,
 *      /collections/savoir-faire/)
 *   Per-SKU shop:     https://shop.terratintagroup.com/prodotto/<slug>/
 *
 * Sartoria has no standalone storefront — Terratinta Group is the parent
 * brand and hosts all the marketing pages. The seed entries reference
 * Sartoria at the collection level (Materici, Tbrick, etc.), so
 * /collections/<slug>/ on terratintagroup.com is the disambiguator. The
 * site is WordPress-backed (?s= search works). og:image fallback covers
 * cases where the per-collection selectors miss.
 *
 * Brand matcher: word-boundary anchor so we match "Sartoria",
 * "Sartoria Materici", "Sartoria Tbrick", etc. — but NOT "sartorial" or
 * arbitrary Italian tokens. Sartoria is a single discrete word in the
 * spreadsheet corpus.
 */
export const sartoriaScraper: Scraper = {
  brand: "Sartoria",
  matches: (b) => /^sartoria\b/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://www.terratintagroup.com/?s=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/collections/"]',
      imageSelectors: [
        ".collection-hero img",
        ".product-image img",
        ".wp-post-image",
        "main img[itemprop='image']",
        "main picture img",
      ],
      waitMs: 1200,
    });
  },
};
