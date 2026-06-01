import { americanOleanScraper } from "./americanOlean.js";
import { bedrosiansScraper } from "./bedrosians.js";
import { benjaminMooreScraper } from "./benjaminMoore.js";
import { cepacScraper } from "./cepac.js";
import { conradBrickScraper } from "./conradBrick.js";
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
import { sherwinWilliamsScraper } from "./sherwinWilliams.js";
import { sonomaTilemakersScraper } from "./sonomaTilemakers.js";
import type { Scraper, TradeKind } from "./types.js";

export * from "./types.js";
export { closeScraperBrowser } from "./playwrightFetch.js";

/**
 * Brand adapters by trade. Seventeen tile adapters cover ~91% of bath/shower
 * entries in the seed data; paint adapters (Sherwin-Williams, Benjamin Moore)
 * open up the first non-tile trade. Each uses Playwright (sharing the
 * Chromium installed for Phase 5 PDF generation) to render the
 * manufacturer's search page, navigate to the first product result, and
 * resolve the product image via brand-specific CSS selectors with og:image
 * fallback.
 *
 * Each adapter's URL pattern + selectors are best-effort and need to be
 * validated against live data. Use `pnpm db:test-scraper <brand> "<query>"`
 * to probe a real site and see what comes back; tweak the adapter and
 * iterate. Manual upload remains the supported fallback when an adapter
 * fails or the manufacturer isn't covered.
 *
 * Registry order is alphabetical by brand within trade: "benjamin" sorts
 * before "bedrosians" alphabetically but they live in different trades, so
 * each trade's list is independently alphabetized.
 */
const SCRAPERS: Scraper[] = [
  americanOleanScraper,
  bedrosiansScraper,
  cepacScraper,
  conradBrickScraper,
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
  // Paint adapters — first non-tile trade.
  benjaminMooreScraper,
  sherwinWilliamsScraper,
];

/** Scraper.trade defaults to "tile" for legacy adapters that omit the field. */
function tradeOf(s: Scraper): TradeKind {
  return s.trade ?? "tile";
}

/**
 * Resolve a scraper by brand, optionally constrained to a trade. Trade
 * filter is opt-in so existing callers (queue, audit, test harness) keep
 * working without changes; paint callers should pass `trade: "paint"` to
 * avoid accidentally matching a tile brand that happens to share a token.
 */
export function findScraper(brand: string, trade?: TradeKind): Scraper | null {
  return (
    SCRAPERS.find(
      (s) => (!trade || tradeOf(s) === trade) && s.matches(brand),
    ) ?? null
  );
}

export function registeredBrands(trade?: TradeKind): string[] {
  return SCRAPERS.filter((s) => !trade || tradeOf(s) === trade).map(
    (s) => s.brand,
  );
}
