import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { promises as fsp, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "../src/db/client.js";
import { makeDbi, type Dbi } from "../src/db/dbi.js";
import * as sqliteSchema from "../src/db/schema.sqlite.js";
import {
  imageKey,
  makeLocalStorage,
  type ImageStorage,
} from "../src/services/imageStorage.js";
import { makeScrapeQueue } from "../src/services/scrapeQueue.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(__dirname, "../src/db/migrations/sqlite");

type StoredEntry = { key: string; buffer: Buffer; contentType: string };

function buildDbi(): { dbi: Dbi; client: Database.Database } {
  const client = new Database(":memory:");
  client.pragma("foreign_keys = ON");
  const d = drizzle(client, { schema: sqliteSchema });
  migrate(d, { migrationsFolder: MIGRATIONS });
  const db: AppDb = { kind: "sqlite", client, drizzle: d, schema: sqliteSchema };
  return { dbi: makeDbi(db), client };
}

function buildFakeStorage(): { storage: ImageStorage; stored: StoredEntry[] } {
  const stored: StoredEntry[] = [];
  const storage: ImageStorage = {
    async put(key, buffer, contentType) {
      stored.push({ key, buffer, contentType });
      const safe = key.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase();
      return `/fake-uploads/${safe}.bin`;
    },
    async urlFor(key) {
      const hit = stored.find((s) => s.key === key);
      if (!hit) return null;
      const safe = key.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase();
      return `/fake-uploads/${safe}.bin`;
    },
  };
  return { storage, stored };
}

describe("imageKey()", () => {
  it("joins brand and sku with a double-underscore", () => {
    expect(imageKey("Daltile", "MA85")).toBe("Daltile__MA85");
  });

  it("preserves spaces and case (caller controls normalization)", () => {
    expect(imageKey("Bedrosians Tile", "Pearl 44")).toBe(
      "Bedrosians Tile__Pearl 44",
    );
  });
});

describe("makeScrapeQueue()", () => {
  let ctx: ReturnType<typeof buildDbi>;
  let fake: ReturnType<typeof buildFakeStorage>;

  beforeEach(() => {
    ctx = buildDbi();
    fake = buildFakeStorage();
  });

  afterEach(() => {
    ctx.client.close();
  });

  it("runOnce returns kind 'no-scraper' for an unknown brand", async () => {
    const queue = makeScrapeQueue(() => ctx.dbi, fake.storage);
    const outcome = await queue.runOnce({
      brand: "FakeBrandThatDoesNotExist",
      cacheKey: "SKU-XYZ",
      style: "Foo",
      color: "Bar",
    });
    expect(outcome.kind).toBe("no-scraper");
    if (outcome.kind === "no-scraper") {
      expect(outcome.brand).toBe("FakeBrandThatDoesNotExist");
    }
    // Nothing should have been written to storage either.
    expect(fake.stored).toHaveLength(0);
  });

  it("runOnce returns kind 'cached' when manufacturer_images already has a row", async () => {
    const brand = "FakeBrandThatDoesNotExist";
    const cacheKey = "CACHED-1";
    const existingUrl = "/uploads/already-there.jpg";
    await ctx.dbi.exec(
      `INSERT INTO manufacturer_images (id, brand, sku, image_url) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), brand, cacheKey, existingUrl],
    );

    const queue = makeScrapeQueue(() => ctx.dbi, fake.storage);
    const outcome = await queue.runOnce({ brand, cacheKey });

    expect(outcome.kind).toBe("cached");
    if (outcome.kind === "cached") {
      expect(outcome.imageUrl).toBe(existingUrl);
    }
    // Cached path should short-circuit before any scraper or storage usage.
    expect(fake.stored).toHaveLength(0);
  });

  it("enqueue can be called rapidly for the same key without throwing", async () => {
    const queue = makeScrapeQueue(() => ctx.dbi, fake.storage);
    const input = {
      brand: "FakeBrandThatDoesNotExist",
      cacheKey: "DEDUP-1",
      style: "S",
      color: "C",
    };
    expect(() => {
      queue.enqueue(input);
      queue.enqueue(input);
      queue.enqueue(input);
    }).not.toThrow();

    // Let the deferred drain run. It will hit the no-scraper path and exit
    // cleanly without touching the network or storage.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    // No-scraper outcome means nothing is persisted.
    const rows = await ctx.dbi.query(
      `SELECT id FROM manufacturer_images WHERE brand = $1 AND sku = $2`,
      [input.brand, input.cacheKey],
    );
    expect(rows).toHaveLength(0);
    expect(fake.stored).toHaveLength(0);
  });
});

describe("makeLocalStorage()", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "ch-storage-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("put writes a file and returns a URL with the publicPrefix", async () => {
    const storage = makeLocalStorage({ rootDir: tmpDir, publicPrefix: "/uploads" });
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // jpg magic-ish
    const url = await storage.put("daltile__abc123", buf, "image/jpeg");

    expect(url.startsWith("/uploads/")).toBe(true);
    const fileName = url.slice("/uploads/".length);
    const onDisk = await fsp.readFile(path.join(tmpDir, fileName));
    expect(onDisk.equals(buf)).toBe(true);
  });

  it("uses .png suffix for image/png", async () => {
    const storage = makeLocalStorage({ rootDir: tmpDir, publicPrefix: "/uploads" });
    const url = await storage.put("k-png", Buffer.from("png"), "image/png");
    expect(url.endsWith(".png")).toBe(true);
  });

  it("uses .jpg suffix for image/jpeg", async () => {
    const storage = makeLocalStorage({ rootDir: tmpDir, publicPrefix: "/uploads" });
    const url = await storage.put("k-jpg", Buffer.from("jpg"), "image/jpeg");
    expect(url.endsWith(".jpg")).toBe(true);
  });

  it("uses .webp suffix for image/webp", async () => {
    const storage = makeLocalStorage({ rootDir: tmpDir, publicPrefix: "/uploads" });
    const url = await storage.put("k-webp", Buffer.from("webp"), "image/webp");
    expect(url.endsWith(".webp")).toBe(true);
  });

  it("slugifies keys: spaces and special chars become dashes, output is lowercase", async () => {
    const storage = makeLocalStorage({ rootDir: tmpDir, publicPrefix: "/uploads" });
    const url = await storage.put("Foo Bar 123", Buffer.from("x"), "image/jpeg");
    // Strip prefix + extension to inspect the slug.
    expect(url.startsWith("/uploads/")).toBe(true);
    expect(url.endsWith(".jpg")).toBe(true);
    const slug = url.slice("/uploads/".length, -".jpg".length);
    expect(slug).toBe(slug.toLowerCase());
    expect(slug).not.toContain(" ");
    expect(slug).toMatch(/^foo-bar-123$/);
  });

  it("urlFor returns the stored URL after put, and null for unknown keys", async () => {
    const storage = makeLocalStorage({ rootDir: tmpDir, publicPrefix: "/uploads" });

    const missing = await storage.urlFor("never-stored");
    expect(missing).toBeNull();

    const putUrl = await storage.put("hello-world", Buffer.from("hi"), "image/png");
    const found = await storage.urlFor("hello-world");
    expect(found).toBe(putUrl);
  });
});
