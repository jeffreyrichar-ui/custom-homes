import { fetchProductImage } from "./genericFetch.js";
import type { Scraper } from "./types.js";

export const msiScraper: Scraper = {
  brand: "MSI",
  matches: (b) => /^(msi|m\.s\.i\.|msi surfaces|msi stone)/i.test(b.trim()),
  async scrape(sku: string) {
    const url = `https://www.msisurfaces.com/search-results/?q=${encodeURIComponent(sku)}`;
    return fetchProductImage({
      url,
      selectors: [
        ".product-image img",
        ".product-card img",
        "main img",
      ],
      referer: "https://www.msisurfaces.com/",
    });
  },
};
