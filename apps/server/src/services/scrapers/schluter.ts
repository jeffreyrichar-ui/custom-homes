import { fetchProductImage } from "./genericFetch.js";
import type { Scraper } from "./types.js";

export const schluterScraper: Scraper = {
  brand: "Schluter",
  matches: (b) => /^schluter/i.test(b.trim()),
  async scrape(sku: string) {
    // Schluter's product search URL pattern. Real implementation should
    // hit the product details page; this URL is a placeholder until the
    // exact SKU → URL mapping is reverse-engineered for production.
    const url = `https://www.schluter.com/schluter-us/en_US/search?q=${encodeURIComponent(sku)}`;
    return fetchProductImage({
      url,
      selectors: [
        "img.product-image",
        ".product-detail img",
        "main img",
      ],
      referer: "https://www.schluter.com/",
    });
  },
};
