import { fetchProductImagePlaywright } from "./playwrightFetch.js";
import { searchQuery, type Scraper } from "./types.js";

/**
 * Conrad Brick — American Olean product line (no standalone domain).
 *
 * Tamara's spreadsheets list "Conrad Brick" as the brand for 4 seed
 * entries even though it's technically an American Olean collection
 * (2.25"x8" glossy porcelain wall brick in 7 colors: Linen, Stark,
 * Marine, Tin, Sage, Siren, Polar). There is no `conradbrick.com`
 * — distributors host pages but the canonical PDPs live on AO:
 *
 *   Collection: https://www.americanolean.com/products/wall/conrad-brick
 *   Variants:   https://www.americanolean.com/products/wall/conrad-brick/<color>
 *               (e.g. /polar, /marine, /tin, /linen, /sage, /siren, /stark)
 *   Search:     https://www.americanolean.com/search?q=<query>
 *
 * A dedicated adapter (rather than relying on americanOleanScraper) is
 * needed because the AO matcher only fires on "AO" / "American Olean"
 * brand strings, never on "Conrad Brick" directly. Live testing was
 * skipped from this sandbox since outbound network is restricted to
 * registry.npmjs.org; the URL pattern was confirmed via Google search.
 */
export const conradBrickScraper: Scraper = {
  brand: "Conrad Brick",
  matches: (b) => /^conrad\s+brick\b/i.test(b.trim()),
  async scrape(input) {
    const q = searchQuery(input);
    if (!q) return null;
    // Scope the query to the Conrad Brick collection so AO's site search
    // doesn't drift into sibling brick-format series (Brickwork, etc.).
    const scoped = `conrad brick ${q}`;
    const searchUrl = `https://www.americanolean.com/search?q=${encodeURIComponent(scoped)}`;
    return fetchProductImagePlaywright({
      searchUrl,
      productLinkSelector: 'a[href*="/products/wall/conrad-brick"]',
      imageSelectors: [
        ".product-detail-image img",
        ".product-image img",
        ".pdp-hero img",
        "main img[itemprop='image']",
        "main picture img",
      ],
      waitMs: 1500,
    });
  },
};
