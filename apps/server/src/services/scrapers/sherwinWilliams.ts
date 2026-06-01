import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import type { Scraper } from "./types.js";

/**
 * Sherwin-Williams — first non-tile adapter (paint).
 *
 * Confirmed URL patterns (Google search, 2026-06):
 *   Search landing:  https://www.sherwin-williams.com/en-us/color
 *   Color-detail:    https://www.sherwin-williams.com/en-us/color/color-family/<family>/sw<num>-<slug>
 *     e.g. .../color-family/white-paint-colors/sw7008-alabaster
 *          .../color-family/neutral-paint-colors/sw7029-agreeable-gray
 *
 * Paint matches differently from tile: there's no shape disambiguator, the
 * SKU ("SW 7008") is canonical and the color name is the human signal. We
 * stitch sku + color together as the query rather than using searchQuery()
 * (which is shape-first and tile-tuned).
 *
 * Search URL is best-effort: the public site uses Optimizely-backed search
 * but the exact param name isn't documented. `?searchQuery=` is the common
 * Optimizely default and matches the Daltile pattern in this codebase.
 *
 * Brand matcher accepts "Sherwin-Williams", "Sherwin Williams", and "SW"
 * (case-insensitive) — but "SW" must be a discrete token, not a prefix.
 */
export const sherwinWilliamsScraper: Scraper = {
  brand: "Sherwin-Williams",
  trade: "paint",
  matches: (b) => {
    const t = b.trim().toLowerCase();
    if (t === "sw") return true;
    return /^sherwin[-\s]?williams\b/i.test(t);
  },
  async scrape(input) {
    // Paint adapters key off sku + color, NOT searchQuery() (shape-first).
    const q = [input.sku, input.color, input.style].filter(Boolean).join(" ").trim();
    if (!q) return null;
    // best-effort: Optimizely search param; falls back to og:image on detail page
    const searchUrl = `https://www.sherwin-williams.com/en-us/color/search?searchQuery=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/en-us/color/color-family/"]',
      imageSelectors: [
        // best-effort: SW serves color-chip cards on family pages
        '[data-testid="color-chip"] img',
        ".color-chip-card img",
        ".cmp-colorchip img",
        ".color-detail__chip img",
        "main img[itemprop='image']",
      ],
      waitMs: 1500,
    });
  },
};
