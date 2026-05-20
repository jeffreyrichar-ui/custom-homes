import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

export const schluterScraper: Scraper = {
  brand: "Schluter",
  matches: (b) => /^schluter/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://www.schluter.com/schluter-us/en_US/search?q=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/product/"]',
      imageSelectors: [
        ".product-image img",
        ".product-detail img",
        "main img",
      ],
      waitMs: 1000,
    });
  },
};
