import { daltileScraper } from "./daltile.js";
import { msiScraper } from "./msi.js";
import { schluterScraper } from "./schluter.js";
import type { Scraper } from "./types.js";

export * from "./types.js";

/**
 * STATUS: experimental.
 *
 * These adapters use plain fetch + cheerio + OpenGraph fallback. Modern
 * manufacturer sites (Schluter, MSI, Daltile) increasingly render product
 * details with client-side JS and gate scrapers with bot challenges, so
 * these will frequently return generic or wrong images.
 *
 * Manual upload via /api/manufacturer-images/upload is the supported path
 * for getting real product photos into the cache. The UI surfaces upload
 * as the primary action; auto-fetch is offered as a low-effort secondary.
 *
 * To make a scraper production-grade for a specific brand:
 *   1. Reverse-engineer the SKU → product-detail URL pattern on real data
 *   2. If the site renders details client-side, swap fetchProductImage for
 *      a Playwright launch (interface unchanged; just the fetch impl moves)
 *   3. Tighten the CSS selectors to the actual product image element
 *
 * Adding a new brand = one new file in this directory + add to SCRAPERS.
 */
const SCRAPERS: Scraper[] = [schluterScraper, msiScraper, daltileScraper];

export function findScraper(brand: string): Scraper | null {
  return SCRAPERS.find((s) => s.matches(brand)) ?? null;
}

export function registeredBrands(): string[] {
  return SCRAPERS.map((s) => s.brand);
}
