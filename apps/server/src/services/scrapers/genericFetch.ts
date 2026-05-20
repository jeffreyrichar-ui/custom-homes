import * as cheerio from "cheerio";
import { ScrapeError, type ScrapeResult } from "./types.js";

/**
 * Shared helper used by every brand adapter: fetch HTML, find a product
 * image via brand-specific selectors with OpenGraph fallback, download the
 * image bytes. Brand adapters supply the URL pattern and selector list.
 *
 * NB: Production-grade scrapers should swap this for Playwright/Puppeteer to
 * handle JS-rendered pages and bot challenges. This is the lightweight path
 * — sufficient for sites that emit `og:image` in static HTML, which most
 * tile-manufacturer product pages do.
 */
export async function fetchProductImage(opts: {
  url: string;
  selectors: string[]; // CSS selectors tried in order; first match wins
  referer?: string;
  userAgent?: string;
}): Promise<ScrapeResult> {
  const userAgent =
    opts.userAgent ??
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

  const pageRes = await fetch(opts.url, {
    headers: {
      "user-agent": userAgent,
      "accept": "text/html,application/xhtml+xml",
      ...(opts.referer ? { referer: opts.referer } : {}),
    },
    redirect: "follow",
  });
  if (!pageRes.ok) {
    throw new ScrapeError(`product page fetch ${pageRes.status} (${opts.url})`);
  }
  const html = await pageRes.text();
  const $ = cheerio.load(html);

  let imgSrc: string | null = null;
  for (const sel of [...opts.selectors, 'meta[property="og:image"]', 'meta[name="og:image"]']) {
    const el = $(sel).first();
    if (el.length === 0) continue;
    const candidate = el.attr("content") ?? el.attr("src") ?? el.attr("data-src");
    if (candidate) {
      imgSrc = candidate;
      break;
    }
  }
  if (!imgSrc) {
    throw new ScrapeError("no product image found on page");
  }
  const imgUrl = new URL(imgSrc, opts.url).toString();
  const imgRes = await fetch(imgUrl, {
    headers: { "user-agent": userAgent, referer: opts.url },
  });
  if (!imgRes.ok) {
    throw new ScrapeError(`image download ${imgRes.status} (${imgUrl})`);
  }
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  return { imageBuffer: buf, contentType, sourceUrl: imgUrl };
}
