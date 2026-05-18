import { americanOleanScraper } from "./americanOlean.js";
import { bedrosiansScraper } from "./bedrosians.js";
import { cepacScraper } from "./cepac.js";
import { daltileScraper } from "./daltile.js";
import { emserScraper } from "./emser.js";
import { floridaTileScraper } from "./floridaTile.js";
import { lungarnoScraper } from "./lungarno.js";
import { maniscalcoScraper } from "./maniscalco.js";
import { marazziScraper } from "./marazzi.js";
import { marbleSystemsScraper } from "./marbleSystems.js";
import { msiScraper } from "./msi.js";
import { portobelloScraper } from "./portobello.js";
import { ragnoScraper } from "./ragno.js";
import { sartoriaScraper } from "./sartoria.js";
import { schluterScraper } from "./schluter.js";
import { sonomaTilemakersScraper } from "./sonomaTilemakers.js";
import type { Scraper } from "./types.js";

export * from "./types.js";
export { closeScraperBrowser } from "./playwrightFetch.js";

/**
 * Sixteen brand adapters covering ~91% of bath/shower tile entries in the
 * seed data. Each uses Playwright (sharing the Chromium installed for
 * Phase 5 PDF generation) to render the manufacturer's search page,
 * navigate to the first product result, and resolve the product image
 * via brand-specific CSS selectors with og:image fallback.
 *
 * Each adapter's URL pattern + selectors are best-effort and need to be
 * validated against live data. Use `pnpm db:test-scraper <brand> "<query>"`
 * to probe a real site and see what comes back; tweak the adapter and
 * iterate. Manual upload remains the supported fallback when an adapter
 * fails or the manufacturer isn't covered.
 */
const SCRAPERS: Scraper[] = [
  americanOleanScraper,
  bedrosiansScraper,
  cepacScraper,
  daltileScraper,
  emserScraper,
  floridaTileScraper,
  lungarnoScraper,
  maniscalcoScraper,
  marazziScraper,
  marbleSystemsScraper,
  msiScraper,
  portobelloScraper,
  ragnoScraper,
  sartoriaScraper,
  schluterScraper,
  sonomaTilemakersScraper,
];

export function findScraper(brand: string): Scraper | null {
  return SCRAPERS.find((s) => s.matches(brand)) ?? null;
}

export function registeredBrands(): string[] {
  return SCRAPERS.map((s) => s.brand);
}
