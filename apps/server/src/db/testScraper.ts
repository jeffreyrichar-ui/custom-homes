#!/usr/bin/env tsx
/**
 * Local probe for a single scraper. Tests against the real manufacturer
 * site from your machine (the dev sandbox can't reach those hosts).
 *
 * Usage:
 *   pnpm db:test-scraper Bedrosians "marin penny"
 *   pnpm db:test-scraper Daltile "Miramo Pearl MR 44"
 *   pnpm db:test-scraper Emser "Visconde Oro Polished"
 *
 * For every probe it writes:
 *   /tmp/scraper-debug-<brand>-<query>/01-search.png
 *   /tmp/scraper-debug-<brand>-<query>/02-detail.png      (if a product link was found)
 *   /tmp/scraper-debug-<brand>-<query>/result.<ext>       (the resolved image)
 *   /tmp/scraper-debug-<brand>-<query>/log.json           (urls + selectors hit)
 *
 * Open the screenshots to see what Playwright is actually seeing. That
 * lets you diagnose:
 *   - Search returned no products?            (search page screenshot tells you)
 *   - Wrong product picked?                   (detail page screenshot)
 *   - Right page but wrong image extracted?   (log.json shows the matched selector)
 */
import fs from "node:fs";
import path from "node:path";
import {
  closeScraperBrowser,
  findScraper,
  registeredBrands,
} from "../services/scrapers/index.js";
import {
  fetchProductImagePlaywright,
  type DebugStep,
} from "../services/scrapers/playwrightFetch.js";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Map from a brand-adapter result back to the underlying Playwright call
 * so we can pass debug options. We re-run the adapter's URL pattern manually
 * by inspecting the source — for now we just import the helpers it uses. */
type AdapterShape = {
  brand: string;
  matches(b: string): boolean;
  scrape(input: { brand: string; sku: string | null; style: string | null; color: string | null }): Promise<unknown>;
};

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

  const scraper = findScraper(brandArg) as AdapterShape | null;
  if (!scraper) {
    console.error(`no scraper registered for "${brandArg}"`);
    console.error("registered brands:", registeredBrands().join(", "));
    process.exit(1);
  }

  const debugDir = path.join("/tmp", `scraper-debug-${slug(brandArg)}-${slug(query)}`);
  fs.mkdirSync(debugDir, { recursive: true });

  console.log(`Using scraper: ${scraper.brand}`);
  console.log(`Query: "${query}"`);
  console.log(`Debug dir: ${debugDir}\n`);

  const debugSteps: DebugStep[] = [];

  // We monkey-patch fetchProductImagePlaywright at module level by re-importing it
  // and calling the scraper with the debug-attached call below. To keep the
  // adapters API clean (they don't know about debugDir), we duplicate the call
  // here using the same arguments the adapter would produce. The clearest way to
  // do that is to import the adapter's own logic — but to keep this script
  // simple, we just call scraper.scrape() and rely on the adapters to optionally
  // accept a second arg in the future. For now, run the adapter normally and
  // augment with debug info from a stub run.
  //
  // Simplest path: rerun the adapter with a wrapping helper that captures debug.

  // Patch the fetcher to record into our DebugStep array on this single call.
  // We do this by importing and overriding the module's exported function for
  // the duration of this run.
  const playwrightMod = await import("../services/scrapers/playwrightFetch.js");
  const mod = playwrightMod as unknown as {
    fetchProductImagePlaywright: typeof fetchProductImagePlaywright;
  };
  const originalFetch: typeof fetchProductImagePlaywright = mod.fetchProductImagePlaywright;
  mod.fetchProductImagePlaywright = (opts) =>
    originalFetch({ ...opts, debugDir }, debugSteps);

  try {
    const result = await scraper.scrape({
      brand: scraper.brand,
      sku: null,
      style: query,
      color: null,
    });

    fs.writeFileSync(
      path.join(debugDir, "log.json"),
      JSON.stringify({ brand: scraper.brand, query, steps: debugSteps }, null, 2),
    );

    if (!result) {
      console.log("Scraper returned null. See log.json for what happened.");
      printSteps(debugSteps);
      return;
    }
    const r = result as { imageBuffer: Buffer; contentType: string; sourceUrl: string };
    const ext = r.contentType.includes("png") ? "png" : r.contentType.includes("webp") ? "webp" : "jpg";
    const outPath = path.join(debugDir, `result.${ext}`);
    fs.writeFileSync(outPath, r.imageBuffer);
    console.log(`\n=== Scrape result ===`);
    console.log(`source URL : ${r.sourceUrl}`);
    console.log(`content    : ${r.contentType}`);
    console.log(`bytes      : ${r.imageBuffer.length}`);
    console.log(`saved to   : ${outPath}`);
    console.log(`\n=== Debug trace ===`);
    printSteps(debugSteps);
    console.log(`\nOpen ${outPath} to verify the right image came back.`);
    console.log(`Open ${debugDir}/01-search.png and 02-detail.png to see what Chromium rendered.`);
  } finally {
    mod.fetchProductImagePlaywright = originalFetch;
    await closeScraperBrowser();
  }
}

function printSteps(steps: DebugStep[]): void {
  for (const s of steps) {
    console.log(`  [${s.stage}] ${s.url || "(no url)"}`);
    if (s.note) console.log(`           → ${s.note}`);
    if (s.screenshot) console.log(`           → screenshot: ${s.screenshot}`);
  }
}

main().catch(async (err) => {
  console.error(err);
  await closeScraperBrowser().catch(() => {});
  process.exit(1);
});
