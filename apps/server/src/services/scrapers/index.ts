import { daltileScraper } from "./daltile.js";
import { msiScraper } from "./msi.js";
import { schluterScraper } from "./schluter.js";
import type { Scraper } from "./types.js";

export * from "./types.js";

const SCRAPERS: Scraper[] = [schluterScraper, msiScraper, daltileScraper];

export function findScraper(brand: string): Scraper | null {
  return SCRAPERS.find((s) => s.matches(brand)) ?? null;
}

export function registeredBrands(): string[] {
  return SCRAPERS.map((s) => s.brand);
}
