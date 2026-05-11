import { randomUUID } from "node:crypto";
import type { Dbi } from "../db/dbi.js";
import type { ImageStorage } from "./imageStorage.js";
import { imageKey } from "./imageStorage.js";
import { findScraper } from "./scrapers/index.js";

type Job = { brand: string; sku: string };

export type ScrapeQueue = {
  enqueue(brand: string, sku: string): void;
  /** Run a single scrape synchronously — used by manual retry and tests. */
  runOnce(brand: string, sku: string): Promise<ScrapeOutcome>;
};

export type ScrapeOutcome =
  | { kind: "cached"; imageUrl: string }
  | { kind: "scraped"; imageUrl: string }
  | { kind: "no-scraper"; brand: string }
  | { kind: "failed"; brand: string; sku: string; reason: string };

export function makeScrapeQueue(getDbi: () => Dbi, storage: ImageStorage): ScrapeQueue {
  const queue: Job[] = [];
  const inFlight = new Set<string>();
  let running = false;

  async function lookupCached(brand: string, sku: string): Promise<string | null> {
    const rows = await getDbi().query<{ image_url: string }>(
      `SELECT image_url FROM manufacturer_images WHERE brand = $1 AND sku = $2 LIMIT 1`,
      [brand, sku],
    );
    return rows[0]?.image_url ?? null;
  }

  async function persist(brand: string, sku: string, imageUrl: string) {
    await getDbi().exec(
      `INSERT INTO manufacturer_images (id, brand, sku, image_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(brand, sku) DO UPDATE SET image_url = excluded.image_url, scraped_at = CURRENT_TIMESTAMP`,
      [randomUUID(), brand, sku, imageUrl],
    );
  }

  async function process(job: Job): Promise<ScrapeOutcome> {
    const cached = await lookupCached(job.brand, job.sku);
    if (cached) return { kind: "cached", imageUrl: cached };

    const scraper = findScraper(job.brand);
    if (!scraper) return { kind: "no-scraper", brand: job.brand };

    try {
      const result = await scraper.scrape(job.sku);
      if (!result) {
        return { kind: "failed", brand: job.brand, sku: job.sku, reason: "scraper returned null" };
      }
      const url = await storage.put(
        imageKey(job.brand, job.sku),
        result.imageBuffer,
        result.contentType,
      );
      await persist(job.brand, job.sku, url);
      return { kind: "scraped", imageUrl: url };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[scrape] ${job.brand} ${job.sku} failed: ${reason}`);
      return { kind: "failed", brand: job.brand, sku: job.sku, reason };
    }
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length > 0) {
        const job = queue.shift()!;
        await process(job).catch(() => {/* never lets one bad job kill the drain */});
        inFlight.delete(`${job.brand}|${job.sku}`);
      }
    } finally {
      running = false;
    }
  }

  return {
    enqueue(brand, sku) {
      if (!brand || !sku) return;
      const key = `${brand}|${sku}`;
      if (inFlight.has(key)) return;
      inFlight.add(key);
      queue.push({ brand, sku });
      // Fire and forget — never block the request.
      setImmediate(() => {
        drain().catch((err) => console.error("[scrape] drain error", err));
      });
    },
    runOnce(brand, sku) {
      return process({ brand, sku });
    },
  };
}
