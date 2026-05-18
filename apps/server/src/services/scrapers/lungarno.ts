import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * Lungarno Ceramics — handcrafted ceramic tile brand (Style Access).
 *
 * Two domains exist (Google search, 2026-05):
 *   thelungarno.com         — current marketing site, clean URLs, sparse
 *                             public index but the canonical brand presence.
 *   lungarnoceramics.com    — legacy site with per-collection .html pages
 *                             (urban_classics_wall.html, diskporcelain.html,
 *                              natural_elements_a.html, etc.).
 *
 * The modern thelungarno.com is where Lungarno actively promotes its current
 * collections (Zellige, Linea, Back to Basics, Marrakesh), so we target it
 * first. The site is a WordPress build (confirmed by URL conventions on
 * landing pages); WordPress default search is ?s=<q>. og:image is reliable
 * on product detail pages.
 *
 * Brand matcher: anchor on word boundary so "lungarno" matches itself and
 * "Lungarno Ceramics", but NOT arbitrary Italian-sounding tokens. The seed
 * corpus stores entries as the bare "Lungarno".
 */
export const lungarnoScraper: Scraper = {
  brand: "Lungarno",
  matches: (b) => /^lungarno\b/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://thelungarno.com/?s=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      // thelungarno.com is WP-based; collection/product links share the
      // /products/ slug prefix typical of WooCommerce + custom-page setups.
      productLinkSelector: 'a[href*="/products/"], a[href*="/collections/"]',
      imageSelectors: [
        ".product-image img",
        ".product-gallery img",
        ".collection-hero img",
        ".wp-post-image",
        "main img[itemprop='image']",
        "main picture img",
      ],
      waitMs: 1200,
    });
  },
};
