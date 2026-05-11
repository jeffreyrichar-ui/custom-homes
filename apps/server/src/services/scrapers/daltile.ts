import { fetchProductImage } from "./genericFetch.js";
import type { Scraper } from "./types.js";

export const daltileScraper: Scraper = {
  brand: "Daltile",
  matches: (b) => /^daltile/i.test(b.trim()),
  async scrape(sku: string) {
    const url = `https://www.daltile.com/search?text=${encodeURIComponent(sku)}`;
    return fetchProductImage({
      url,
      selectors: [
        "img.product-image",
        ".tile-image img",
        "main img",
      ],
      referer: "https://www.daltile.com/",
    });
  },
};
