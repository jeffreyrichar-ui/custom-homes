import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Dbi } from "../db/dbi.js";
import type { ImageStorage } from "../services/imageStorage.js";
import { imageKey } from "../services/imageStorage.js";
import type { ScrapeQueue } from "../services/scrapeQueue.js";
import { registeredBrands } from "../services/scrapers/index.js";
import { adminAuth } from "../middleware/adminAuth.js";

export function makeManufacturerImagesRouter(
  getDbi: () => Dbi,
  storage: ImageStorage,
  queue: ScrapeQueue,
): Router {
  const router = Router();

  // Cached lookup — no auth needed (used by selections UI to show thumbnails)
  router.get("/", async (req, res, next) => {
    try {
      const brand = typeof req.query.brand === "string" ? req.query.brand : "";
      const sku = typeof req.query.sku === "string" ? req.query.sku : "";
      if (!brand || !sku) {
        res.status(400).json({ error: "brand and sku required" });
        return;
      }
      const rows = await getDbi().query<{ image_url: string; scraped_at: string }>(
        `SELECT image_url, scraped_at FROM manufacturer_images
         WHERE brand = $1 AND sku = $2 LIMIT 1`,
        [brand, sku],
      );
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "not cached" });
        return;
      }
      res.json({ image_url: row.image_url, scraped_at: row.scraped_at });
    } catch (err) {
      next(err);
    }
  });

  // Manual upload — admin-only. Body: { brand, sku, data_url } where data_url is "data:image/png;base64,..."
  router.post("/upload", adminAuth, async (req, res, next) => {
    try {
      const brand = typeof req.body?.brand === "string" ? req.body.brand.trim() : "";
      const sku = typeof req.body?.sku === "string" ? req.body.sku.trim() : "";
      const dataUrl = typeof req.body?.data_url === "string" ? req.body.data_url : "";
      if (!brand || !sku || !dataUrl) {
        res.status(400).json({ error: "brand, sku, and data_url required" });
        return;
      }
      const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
      if (!match) {
        res.status(400).json({ error: "data_url must be base64-encoded data: URL" });
        return;
      }
      const contentType = match[1]!;
      const buf = Buffer.from(match[2]!, "base64");
      if (buf.length > 5 * 1024 * 1024) {
        res.status(413).json({ error: "image must be <= 5MB" });
        return;
      }
      const url = await storage.put(imageKey(brand, sku), buf, contentType);
      await getDbi().exec(
        `INSERT INTO manufacturer_images (id, brand, sku, image_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(brand, sku) DO UPDATE SET image_url = excluded.image_url, scraped_at = CURRENT_TIMESTAMP`,
        [randomUUID(), brand, sku, url],
      );
      res.status(201).json({ image_url: url });
    } catch (err) {
      next(err);
    }
  });

  // Manual scrape trigger — admin-only. Synchronous (so the UI can show the result).
  router.post("/scrape", adminAuth, async (req, res, next) => {
    try {
      const brand = typeof req.body?.brand === "string" ? req.body.brand.trim() : "";
      const sku = typeof req.body?.sku === "string" ? req.body.sku.trim() : "";
      if (!brand || !sku) {
        res.status(400).json({ error: "brand and sku required" });
        return;
      }
      const outcome = await queue.runOnce(brand, sku);
      res.json({ outcome, registered_brands: registeredBrands() });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
