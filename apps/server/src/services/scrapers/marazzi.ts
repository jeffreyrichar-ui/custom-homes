import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

export const marazziScraper: Scraper = {
  brand: "Marazzi",
  matches: (b) => /^marazzi|^marrazi|^marrazzi/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://www.marazziusa.com/search?q=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/collections/"]',
      imageSelectors: [
        ".product-image img",
        ".pdp-image img",
        "main img",
      ],
      waitMs: 1000,
    });
  },
};
