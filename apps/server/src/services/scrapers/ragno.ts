import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * Ragno USA — Italian ceramic manufacturer (Marazzi Group US imprint).
 *
 * Confirmed URL patterns (Google search, 2026-05):
 *   Collection landing pages: https://www.ragnousa.com/collections/<series>/
 *   Format/effect indexes:    https://www.ragnousa.com/formats/<shape>/
 *                             https://www.ragnousa.com/effects/<look>/
 *
 * The seed data tracks Ragno entries at the collection level (no per-SKU
 * variants in the spreadsheets), so the /collections/ link is the right
 * disambiguator — it gives us a single hero image per series. The site is
 * a marketing-style catalog rather than a transactional storefront, so
 * og:image (added automatically by the link selector fallback in
 * playwrightFetch) is the reliable signal.
 */
export const ragnoScraper: Scraper = {
  brand: "Ragno",
  // "Ragno" or "Ragno USA" as a standalone token (word boundary on both sides
  // to avoid collisions with future brands beginning with "Ragn...").
  matches: (b) => /^ragno(\s+usa)?\b/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://www.ragnousa.com/?s=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/collections/"]',
      imageSelectors: [
        ".collection-hero img",
        ".product-image img",
        "main img[itemprop='image']",
        "main picture img",
      ],
      waitMs: 1200,
    });
  },
};
