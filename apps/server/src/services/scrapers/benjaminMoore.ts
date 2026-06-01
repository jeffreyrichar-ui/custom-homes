import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import type { Scraper } from "./types.js";

/**
 * Benjamin Moore — second paint adapter (Adobe Experience Manager-backed).
 *
 * Confirmed URL patterns (Google search, 2026-06):
 *   Search landing:  https://www.benjaminmoore.com/en-us/paint-colors/search
 *   Color-detail:    https://www.benjaminmoore.com/en-us/paint-colors/color/<family>/<slug>-<sku>
 *     e.g. .../product/...van-courtland-blue-hc-145/...
 *
 * SKUs follow the {HC,AF,OC,CC}-<num> pattern. Like the SW adapter, paint
 * scrapes are sku+color, not shape-first. og:image is the reliable signal
 * on AEM-backed sites; inline selectors are fallback for redesigns.
 *
 * Brand matcher accepts "Benjamin Moore" and "BM" (case-insensitive), with
 * "BM" as a discrete token only to avoid hitting "BMW", "BMC", etc.
 */
export const benjaminMooreScraper: Scraper = {
  brand: "Benjamin Moore",
  trade: "paint",
  matches: (b) => {
    const t = b.trim().toLowerCase();
    if (t === "bm") return true;
    return /^benjamin\s*moore\b/i.test(t);
  },
  async scrape(input) {
    const q = [input.sku, input.color, input.style].filter(Boolean).join(" ").trim();
    if (!q) return null;
    // best-effort: AEM search param. Detail pages reliably emit og:image,
    // which playwrightFetch tries last and covers selector drift.
    const searchUrl = `https://www.benjaminmoore.com/en-us/paint-colors/search?query=${encodeURIComponent(q)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/paint-colors/color/"]',
      imageSelectors: [
        // best-effort: BM color-detail chip selectors
        ".color-chip img",
        ".color-detail-chip img",
        '[data-component="color-chip"] img',
        "main picture img",
        "main img[itemprop='image']",
      ],
      waitMs: 1500,
    });
  },
};
