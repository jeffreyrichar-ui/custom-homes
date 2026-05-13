import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * Bedrosians — Salesforce Commerce Cloud (SFCC).
 *
 * Confirmed via Google search (2026-05): product detail URLs follow
 *   https://www.bedrosians.com/en/product/detail/<series-slug>/?itemNo=<id>
 *
 * Search URL:
 *   https://www.bedrosians.com/en/search/?q=<query>
 *
 * SFCC detail pages reliably emit og:image. That's our primary signal
 * here; the inline DOM selectors are fallbacks against a site redesign.
 */
export const bedrosiansScraper: Scraper = {
  brand: "Bedrosians",
  matches: (b) => /^bedrosians/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://www.bedrosians.com/en/search/?q=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/product/detail/"]',
      imageSelectors: [
        ".b-product_detail-image img",
        ".pdp-image-gallery_main img",
        ".pdp-image-gallery__main img",
        ".b-pdp_image img",
        "main img[itemprop='image']",
        "main picture img",
      ],
      waitMs: 1500,
    });
  },
};
