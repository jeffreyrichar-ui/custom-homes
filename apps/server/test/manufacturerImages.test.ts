import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import express, { type RequestHandler } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import supertest from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "../src/db/client.js";
import { makeDbi } from "../src/db/dbi.js";
import * as sqliteSchema from "../src/db/schema.sqlite.js";
import type { ImageStorage } from "../src/services/imageStorage.js";
import type { ScrapeQueue } from "../src/services/scrapeQueue.js";
import { makeManufacturerImagesRouter } from "../src/routes/manufacturerImages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(__dirname, "../src/db/migrations/sqlite");

const passthroughAuth: RequestHandler = (_req, _res, next) => next();

function buildApp() {
  const client = new Database(":memory:");
  client.pragma("foreign_keys = ON");
  const d = drizzle(client, { schema: sqliteSchema });
  migrate(d, { migrationsFolder: MIGRATIONS });
  const db: AppDb = { kind: "sqlite", client, drizzle: d, schema: sqliteSchema };
  const dbi = makeDbi(db);

  const stored: Array<{ key: string; bytes: number; contentType: string }> = [];
  const storage: ImageStorage = {
    async put(key, buf, contentType) {
      stored.push({ key, bytes: buf.length, contentType });
      return `/uploads/${key.replace(/[^a-z0-9.]/gi, "-")}.jpg`;
    },
    async urlFor(key) {
      const hit = stored.find((s) => s.key === key);
      return hit ? `/uploads/${key}.jpg` : null;
    },
  };
  const queue: ScrapeQueue = {
    enqueue: () => {},
    runOnce: async (input) => ({ kind: "no-scraper", brand: input.brand }),
  };

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(
    "/api/manufacturer-images",
    makeManufacturerImagesRouter(() => dbi, storage, queue, passthroughAuth),
  );
  return { app, client, dbi, stored };
}

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("/api/manufacturer-images", () => {
  let ctx: ReturnType<typeof buildApp>;
  beforeEach(() => {
    ctx = buildApp();
  });
  afterEach(() => {
    ctx.client.close();
  });

  it("GET returns 404 when nothing cached", async () => {
    const res = await supertest(ctx.app).get(
      "/api/manufacturer-images?brand=Daltile&sku=ABC",
    );
    expect(res.status).toBe(404);
  });

  it("GET requires brand", async () => {
    const res = await supertest(ctx.app).get("/api/manufacturer-images");
    expect(res.status).toBe(400);
  });

  it("POST /upload stores image + inserts row, GET returns it", async () => {
    const up = await supertest(ctx.app)
      .post("/api/manufacturer-images/upload")
      .send({ brand: "Daltile", sku: "ABC", data_url: TINY_PNG_DATA_URL });
    expect(up.status).toBe(201);
    expect(up.body.image_url).toBeTruthy();
    expect(ctx.stored).toHaveLength(1);

    const get = await supertest(ctx.app).get(
      "/api/manufacturer-images?brand=Daltile&sku=ABC",
    );
    expect(get.status).toBe(200);
    expect(get.body.image_url).toBe(up.body.image_url);
  });

  it("POST /upload rejects oversized images", async () => {
    // 8MB of base64 — over the 5MB limit
    const big = "a".repeat(8 * 1024 * 1024);
    const dataUrl = `data:image/jpeg;base64,${big}`;
    const up = await supertest(ctx.app)
      .post("/api/manufacturer-images/upload")
      .send({ brand: "Daltile", sku: "ABC", data_url: dataUrl });
    expect(up.status).toBe(413);
  });

  it("GET falls back to synthetic (brand, style, color) key when sku absent", async () => {
    // Insert a row keyed by the synthetic AUTO-hash for these inputs.
    // The route computes the same hash internally.
    const brand = "Daltile";
    const style = "Miramo";
    const color = "Pearl MR 44";
    const upload = await supertest(ctx.app)
      .post("/api/manufacturer-images/upload")
      .send({
        brand,
        // No real SKU — store under a SKU the route will lookup via fallback.
        sku: "AUTO-fallback",
        data_url: TINY_PNG_DATA_URL,
      });
    expect(upload.status).toBe(201);
    // Manually insert a row with the synthetic key for the (brand, style, color)
    // tuple so the fallback hits it. The route's syntheticKey is sha1 of
    // "brand|style|color" lowercased, first 6 chars, prefixed AUTO-.
    const crypto = await import("node:crypto");
    const hash = crypto
      .createHash("sha1")
      .update(`${brand}|${style}|${color}`.toLowerCase())
      .digest("hex")
      .slice(0, 6);
    await ctx.dbi.exec(
      `INSERT INTO manufacturer_images (id, brand, sku, image_url) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), brand, `AUTO-${hash}`, "/uploads/synthetic.jpg"],
    );
    const get = await supertest(ctx.app).get(
      `/api/manufacturer-images?brand=${encodeURIComponent(brand)}&style=${encodeURIComponent(style)}&color=${encodeURIComponent(color)}`,
    );
    expect(get.status).toBe(200);
    expect(get.body.image_url).toBe("/uploads/synthetic.jpg");
  });

  it("POST /scrape returns no-scraper outcome when registry has no adapter", async () => {
    const res = await supertest(ctx.app)
      .post("/api/manufacturer-images/scrape")
      .send({ brand: "UnknownVendor", style: "X", color: "Y" });
    expect(res.status).toBe(200);
    expect(res.body.outcome.kind).toBe("no-scraper");
  });
});
