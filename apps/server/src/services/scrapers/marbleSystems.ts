import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * Marble Systems — natural stone + porcelain supplier with a product DB.
 *
 * Confirmed URL patterns (Google search, 2026-05):
 *   Product detail:    https://www.marblesystems.com/product/<slug>/
 *     (e.g. /product/belvedere-polished-quartzite-slab-random/)
 *   Collection landing: https://www.marblesystems.com/by/collection/<slug>/
 *     (e.g. /by/collection/belvedere/)
 *   Site-wide search:  https://www.marblesystems.com/?s=<q>  (WordPress)
 *
 * The /product/ singular detail page is canonical for a single tile image,
 * which is what the pattern compositor wants. og:image fallback covers the
 * cases where Marble Systems rotates featured imagery on the detail page.
 *
 * Brand matcher: BOTH "marble" AND "systems" must be present so we don't
 * accidentally swallow generic "marble" entries or unrelated "systems"
 * vendor strings. Anchor on word boundary at start of trimmed input.
 */
export const marbleSystemsScraper: Scraper = {
  brand: "Marble Systems",
  matches: (b) => /^marble\s+systems\b/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://www.marblesystems.com/?s=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      // Singular /product/<slug>/ is the canonical detail URL; /by/collection/
      // is a collection landing page we deprioritize but don't filter out
      // since some hits land there directly.
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
