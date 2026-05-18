import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * Cepac Tile — US importer/distributor of Japanese porcelain mosaics.
 *
 * Confirmed URL patterns (Google search, 2026-05):
 *   Product detail:  https://cepactile.com/product/<slug>/
 *     (e.g. /product/krave/, /product/serenity/, /product/suburbia/,
 *      /product/rokka/, /product/continental-subway/, /product/trapezoid/,
 *      /product/retro-1-hexagon/, /product/lantern/, /product/evermore/,
 *      /product/krave-kr1-sj-sugar/, /product/krave-herringbone/)
 *   Category index:  https://cepactile.com/product-category/tile-lines/
 *
 * Seed entries reference Cepac collections (Krave, Serenity, …). The
 * /product/<slug>/ detail page is the canonical single-image target;
 * WordPress ?s= search routes to it. og:image fallback covers misses.
 *
 * Brand matcher: "cepac" is short enough to risk false positives on
 * unrelated tokens like "Cepacol" / "Cepacia". Anchor on word boundary
 * at BOTH ends so we only match "Cepac" / "Cepac Tile" as discrete words.
 */
export const cepacScraper: Scraper = {
  brand: "Cepac",
  matches: (b) => /^cepac(\s+tile)?\b/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://cepactile.com/?s=${encodeURIComponent(q)}`;
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
