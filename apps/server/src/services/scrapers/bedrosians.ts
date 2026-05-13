import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * Bedrosians is a Shopify-style catalog; product detail pages emit a clean
 * og:image. Search URL pattern verified manually 2026-05.
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
      productLinkSelector: 'a[href*="/en/product/"]',
      imageSelectors: [
        ".product-main-image img",
        ".product-image-gallery__main img",
        "main img",
      ],
      waitMs: 800,
    });
  },
};
