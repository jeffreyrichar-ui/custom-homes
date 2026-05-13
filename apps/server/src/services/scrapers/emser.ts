import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

export const emserScraper: Scraper = {
  brand: "Emser",
  matches: (b) => /^emser/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://www.emser.com/search/?q=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/product/"], a[href*="/tile/"]',
      imageSelectors: [
        ".product-image img",
        ".pdp-hero img",
        "main img",
      ],
      waitMs: 1000,
    });
  },
};
