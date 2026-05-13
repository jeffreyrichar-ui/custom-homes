/**
 * Playwright-backed product image fetcher.
 *
 * Modern manufacturer sites (Bedrosians, Daltile, Emser, Marazzi) ship
 * client-side product detail pages, so a static fetch + cheerio almost
 * never returns the real product photo. This helper drives the same
 * Chromium that's already installed for PDF generation (Phase 5) to
 * resolve a search URL → product detail page → og:image.
 *
 * Brand adapters supply:
 *   - searchUrl(query): turn a search query into the brand's search-page URL
 *   - productLinkSelector: CSS selector that targets the first product card's
 *     <a> on the search results page (to navigate to the detail page)
 *   - imageSelector(s): selectors tried in order on the detail page to find
 *     the product image; og:image is always tried last.
 */
import puppeteer, { type Browser } from "puppeteer";
import { ScrapeError, type ScrapeResult } from "./types.js";

let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browserPromise;
}

export type PlaywrightFetchOpts = {
  searchUrl: string;
  productLinkSelector?: string;
  imageSelectors: string[];
  /** ms to wait for the page to settle */
  waitMs?: number;
};

export async function fetchProductImagePlaywright(
  opts: PlaywrightFetchOpts,
): Promise<ScrapeResult> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    );
    await page.goto(opts.searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
    if (opts.waitMs) await new Promise((r) => setTimeout(r, opts.waitMs));

    // If a product-link selector is supplied, click through to the first result
    if (opts.productLinkSelector) {
      const link = await page.$(opts.productLinkSelector);
      if (link) {
        const href = await page.evaluate((el) => el.getAttribute("href"), link);
        if (href) {
          const target = new URL(href, opts.searchUrl).toString();
          await page.goto(target, { waitUntil: "networkidle2", timeout: 30000 });
          if (opts.waitMs) await new Promise((r) => setTimeout(r, opts.waitMs));
        }
      }
    }

    // Try the imageSelectors in order, fall back to og:image
    const allSelectors = [...opts.imageSelectors, 'meta[property="og:image"]', 'meta[name="og:image"]'];
    let imageUrl: string | null = null;
    for (const sel of allSelectors) {
      const attr = sel.startsWith("meta") ? "content" : "src";
      const got = await page
        .$$eval(sel, (els, a) => {
          const el = els[0];
          if (!el) return null;
          return (
            el.getAttribute(a) ||
            el.getAttribute("src") ||
            el.getAttribute("data-src") ||
            null
          );
        }, attr)
        .catch(() => null);
      if (got) {
        imageUrl = new URL(got, page.url()).toString();
        break;
      }
    }
    if (!imageUrl) throw new ScrapeError("no product image found on detail page");

    const imgResp = await page.goto(imageUrl, { waitUntil: "load", timeout: 30000 });
    if (!imgResp || !imgResp.ok()) {
      throw new ScrapeError(`image download ${imgResp?.status() ?? "?"} (${imageUrl})`);
    }
    const buf = Buffer.from(await imgResp.buffer());
    const contentType = imgResp.headers()["content-type"] ?? "image/jpeg";
    return { imageBuffer: buf, contentType, sourceUrl: imageUrl };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function closeScraperBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise;
  browserPromise = null;
  await b.close().catch(() => {});
}
