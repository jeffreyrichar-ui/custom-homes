import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

export const daltileScraper: Scraper = {
  brand: "Daltile",
  matches: (b) => /^(daltile|dal)\b/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://www.daltile.com/search?text=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/product-detail/"]',
      imageSelectors: [
        ".product-main-image img",
        ".pdp-image-main img",
        ".tile-image img",
        "main img",
      ],
      waitMs: 1200,
    });
  },
};
