import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * Sonoma Tilemakers — California artisan tile manufacturer.
 *
 * Confirmed URL patterns (Google search, 2026-05):
 *   Product detail:    https://sonomatilemakers.com/product/<slug>/
 *     (e.g. /product/hustle-shimmie/, /product/stellar-caicos/,
 *      /product/vihara-1x4/, /product/stellar-2x4/, /product/ro-fusion/)
 *   Collection landing: https://sonomatilemakers.com/<collection>/
 *     (e.g. /hustle/, /stellar-quickship/)
 *
 * Seed entries reference Sonoma collections (Hustle/Shimmie, Vihara, etc.)
 * so the /product/<series>-<variant>/ slug is the right disambiguator —
 * one hero image per variant. The site is a WordPress build (?s= search
 * is the canonical search URL). og:image fallback covers selector misses.
 *
 * Brand matcher: BOTH "sonoma" AND "tilemakers" must be present (the
 * "Sonoma" prefix is shared with other vendors, e.g. Sonoma Cast Stone,
 * and "tilemakers" alone is generic). Anchor on word boundary at start.
 */
export const sonomaTilemakersScraper: Scraper = {
  brand: "Sonoma Tilemakers",
  matches: (b) => /^sonoma\s+tilemakers\b/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://sonomatilemakers.com/?s=${encodeURIComponent(q)}`;
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
