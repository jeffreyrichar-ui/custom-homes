import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * Portobello America — Brazilian porcelain manufacturer.
 *
 * Confirmed product URL pattern (Google search, 2026-05):
 *   https://www.portobelloamerica.com/produto/<slug>/
 *
 * Note "produto" (Portuguese, singular) — collection landing pages use
 *   /product-category/<series>/
 * which aren't what we want here (no canonical single-tile image).
 *
 * Site is WordPress (confirmed by URL conventions + `?s=` WP-default
 * search), so og:image is the reliable signal on product pages and the
 * search page links to /produto/ slugs.
 *
 * Brand matcher accepts variants: "Portobello", "Portobello America",
 * occasional misspellings ("Portobelo").
 */
export const portobelloScraper: Scraper = {
  brand: "Portobello",
  matches: (b) => /^portobell?o\b/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://www.portobelloamerica.com/?s=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      // /produto/<slug>/ is the singular product-detail URL; the plural
      // /product-category/ is a collection landing page we want to skip.
      productLinkSelector: 'a[href*="/produto/"]',
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
