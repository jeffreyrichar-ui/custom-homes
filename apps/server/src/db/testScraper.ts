#!/usr/bin/env tsx
/**
 * Local probe for a single scraper. Use this to validate brand adapters
 * against the real manufacturer site from your machine (the sandbox where
 * code is developed cannot reach those hosts).
 *
 * Usage:
 *   pnpm db:test-scraper Bedrosians "marin penny"
 *   pnpm db:test-scraper Daltile "Miramo Pearl MR 44"
 *   pnpm db:test-scraper Emser "Visconde Oro Polished"
 *
 * Outputs whether the adapter matched, whether it returned an image, what
 * URL it came from, and the byte count. Saves the result to /tmp/<brand>-<query>.jpg
 * so you can eyeball it.
 */
import fs from "node:fs";
import path from "node:path";
import {
  closeScraperBrowser,
  findScraper,
  registeredBrands,
} from "../services/scrapers/index.js";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function main() {
  const [brandArg, ...rest] = process.argv.slice(2);
  if (!brandArg) {
    console.error("usage: pnpm db:test-scraper <brand> <query...>");
    console.error("registered brands:", registeredBrands().join(", "));
    process.exit(1);
  }
  const query = rest.join(" ");
  if (!query) {
    console.error("provide a search query (e.g. style + color or SKU)");
    process.exit(1);
  }

  const scraper = findScraper(brandArg);
  if (!scraper) {
    console.error(`no scraper registered for "${brandArg}"`);
    console.error("registered brands:", registeredBrands().join(", "));
    process.exit(1);
  }
  console.log(`Using scraper: ${scraper.brand}`);
  console.log(`Query: "${query}"`);

  // Split the query into style + color heuristic — the scraper will
  // re-join them. This mirrors what the production code does when a real
  // entry triggers a scrape.
  const result = await scraper.scrape({
    brand: scraper.brand,
    sku: null,
    style: query,
    color: null,
  });

  if (!result) {
    console.log("Scraper returned null (no match).");
    await closeScraperBrowser();
    return;
  }

  const outPath = path.join(
    "/tmp",
    `${slug(brandArg)}-${slug(query)}.${result.contentType.includes("png") ? "png" : "jpg"}`,
  );
  fs.writeFileSync(outPath, result.imageBuffer);
  console.log(`\n=== Scrape result ===`);
  console.log(`source URL: ${result.sourceUrl}`);
  console.log(`content type: ${result.contentType}`);
  console.log(`bytes: ${result.imageBuffer.length}`);
  console.log(`saved to: ${outPath}`);
  console.log(`\nOpen ${outPath} to verify the right image came back.`);

  await closeScraperBrowser();
}

main().catch(async (err) => {
  console.error(err);
  await closeScraperBrowser().catch(() => {});
  process.exit(1);
});
