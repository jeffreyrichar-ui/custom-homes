import { randomUUID } from "node:crypto";
import type { Dbi } from "../db/dbi.js";
import type { ImageStorage } from "./imageStorage.js";
import { imageKey } from "./imageStorage.js";
import { findScraper, type ScrapeInput, type TradeKind } from "./scrapers/index.js";

type Job = ScrapeInput & { cacheKey: string; trade?: TradeKind };

export type ScrapeQueue = {
  /** Enqueue a scrape. cacheKey is the manufacturer_images.sku column value. */
  enqueue(input: ScrapeInput & { cacheKey: string; trade?: TradeKind }): void;
  /** Run a single scrape synchronously — used by manual retry and tests. */
  runOnce(input: ScrapeInput & { cacheKey: string; trade?: TradeKind }): Promise<ScrapeOutcome>;
};

export type ScrapeOutcome =
  | { kind: "cached"; imageUrl: string }
  | { kind: "scraped"; imageUrl: string }
  | { kind: "no-scraper"; brand: string }
  | { kind: "failed"; brand: string; cacheKey: string; reason: string };

export function makeScrapeQueue(getDbi: () => Dbi, storage: ImageStorage): ScrapeQueue {
  const queue: Job[] = [];
  const inFlight = new Set<string>();
  let running = false;

  async function lookupCached(brand: string, cacheKey: string): Promise<string | null> {
    const rows = await getDbi().query<{ image_url: string }>(
      `SELECT image_url FROM manufacturer_images WHERE brand = $1 AND sku = $2 LIMIT 1`,
      [brand, cacheKey],
    );
    return rows[0]?.image_url ?? null;
  }

  async function persist(brand: string, cacheKey: string, imageUrl: string) {
    await getDbi().exec(
      `INSERT INTO manufacturer_images (id, brand, sku, image_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(brand, sku) DO UPDATE SET image_url = excluded.image_url, scraped_at = CURRENT_TIMESTAMP`,
      [randomUUID(), brand, cacheKey, imageUrl],
    );
  }

  async function process(job: Job): Promise<ScrapeOutcome> {
    const cached = await lookupCached(job.brand, job.cacheKey);
    if (cached) return { kind: "cached", imageUrl: cached };

    const scraper = findScraper(job.brand, job.trade);
    if (!scraper) return { kind: "no-scraper", brand: job.brand };

    try {
      const result = await scraper.scrape(job);
      if (!result) {
        return { kind: "failed", brand: job.brand, cacheKey: job.cacheKey, reason: "scraper returned null" };
      }
      const url = await storage.put(
        imageKey(job.brand, job.cacheKey),
        result.imageBuffer,
        result.contentType,
      );
      await persist(job.brand, job.cacheKey, url);
      return { kind: "scraped", imageUrl: url };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[scrape] ${job.brand} ${job.cacheKey} failed: ${reason}`);
      return { kind: "failed", brand: job.brand, cacheKey: job.cacheKey, reason };
    }
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length > 0) {
        const job = queue.shift()!;
        await process(job).catch(() => {});
        inFlight.delete(`${job.brand}|${job.cacheKey}`);
      }
    } finally {
      running = false;
    }
  }

  return {
    enqueue(input) {
      const key = `${input.brand}|${input.cacheKey}`;
      if (inFlight.has(key)) return;
      inFlight.add(key);
      queue.push(input);
      setImmediate(() => {
        drain().catch((err) => console.error("[scrape] drain error", err));
      });
    },
    runOnce(input) {
      return process(input);
    },
  };
}
