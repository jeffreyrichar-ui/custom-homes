import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

export const msiScraper: Scraper = {
  brand: "MSI",
  matches: (b) => /^(msi|m\.s\.i\.|msi surfaces|msi stone)/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    const searchUrl = `https://www.msisurfaces.com/search-results/?q=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/product/"]',
      imageSelectors: [
        ".product-image img",
        ".product-card img",
        "main img",
      ],
      waitMs: 1000,
    });
  },
};
