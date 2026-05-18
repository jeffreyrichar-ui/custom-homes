import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { promises as fsp, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDb } from "../src/db/client.js";
import { makeDbi, type Dbi } from "../src/db/dbi.js";
import * as sqliteSchema from "../src/db/schema.sqlite.js";
import {
  imageKey,
  makeLocalStorage,
  type ImageStorage,
} from "../src/services/imageStorage.js";
import { makeScrapeQueue } from "../src/services/scrapeQueue.js";

// Mock the playwright helper at module scope so every Scraper that depends
// on it picks up the fake. We only assert on the Portobello-specific
// invocation; other tests in this file never reach a real scraper (they
// use "FakeBrandThatDoesNotExist"), so the mock is inert for them.
vi.mock("../src/services/scrapers/playwrightFetch.js", () => ({
  fetchProductImagePlaywright: vi.fn(async () => ({
    imageBuffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    contentType: "image/jpeg",
    sourceUrl: "https://www.portobelloamerica.com/produto/borghini-classico/",
  })),
  closeScraperBrowser: vi.fn(async () => {}),
}));

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

describe("portobelloScraper", () => {
  beforeEach(async () => {
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    vi.mocked(mod.fetchProductImagePlaywright).mockClear();
  });

  it("findScraper resolves the Portobello adapter by exact brand", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    const s = findScraper("Portobello");
    expect(s).not.toBeNull();
    expect(s!.brand).toBe("Portobello");
  });

  it("matches Portobello brand variants case-insensitively and tolerates a common misspelling", async () => {
    const { portobelloScraper } = await import("../src/services/scrapers/portobello.js");
    expect(portobelloScraper.matches("Portobello")).toBe(true);
    expect(portobelloScraper.matches("portobello")).toBe(true);
    expect(portobelloScraper.matches("PORTOBELLO")).toBe(true);
    expect(portobelloScraper.matches("Portobello America")).toBe(true);
    // Single-l misspelling occasionally appears in legacy spreadsheets.
    expect(portobelloScraper.matches("Portobelo")).toBe(true);
    // Sanity: must not match unrelated brands.
    expect(portobelloScraper.matches("Daltile")).toBe(false);
    expect(portobelloScraper.matches("Marazzi")).toBe(false);
  });

  it("scrape() returns null when there is nothing to query on", async () => {
    const { portobelloScraper } = await import("../src/services/scrapers/portobello.js");
    const result = await portobelloScraper.scrape({
      brand: "Portobello",
      sku: null,
      style: null,
      color: null,
      size: null,
      notes: null,
    });
    expect(result).toBeNull();
  });

  it("scrape() hits the WordPress ?s= search URL with the encoded query and returns the mocked image", async () => {
    const { portobelloScraper } = await import("../src/services/scrapers/portobello.js");
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    const fetchMock = vi.mocked(mod.fetchProductImagePlaywright);

    const result = await portobelloScraper.scrape({
      brand: "Portobello",
      sku: null,
      style: "Borghini Classico",
      color: "Bucatini",
      notes: "12x24 polished",
    });

    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("image/jpeg");
    expect(result!.sourceUrl).toContain("portobelloamerica.com/produto/");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const opts = fetchMock.mock.calls[0]![0];
    // Search URL is the WordPress default (?s=) on the .com host.
    expect(opts.searchUrl.startsWith("https://www.portobelloamerica.com/?s=")).toBe(true);
    // Shape comes first (rectangle inferred from 12x24), then style/color.
    expect(decodeURIComponent(opts.searchUrl)).toContain("rectangle");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Borghini Classico");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Bucatini");
    // Singular /produto/ — collection landing pages live at /product-category/.
    expect(opts.productLinkSelector).toContain("/produto/");
    expect(Array.isArray(opts.imageSelectors)).toBe(true);
    expect(opts.imageSelectors.length).toBeGreaterThan(0);
  });
});

describe("ragnoScraper", () => {
  beforeEach(async () => {
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    vi.mocked(mod.fetchProductImagePlaywright).mockClear();
  });

  it("findScraper resolves the Ragno adapter by exact brand", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    const s = findScraper("Ragno");
    expect(s).not.toBeNull();
    expect(s!.brand).toBe("Ragno");
  });

  it("matches Ragno brand variants case-insensitively but not unrelated brands", async () => {
    const { ragnoScraper } = await import("../src/services/scrapers/ragno.js");
    expect(ragnoScraper.matches("Ragno")).toBe(true);
    expect(ragnoScraper.matches("ragno")).toBe(true);
    expect(ragnoScraper.matches("RAGNO")).toBe(true);
    expect(ragnoScraper.matches("Ragno USA")).toBe(true);
    expect(ragnoScraper.matches("ragno usa")).toBe(true);
    // Sanity: must not bleed into other brands.
    expect(ragnoScraper.matches("Daltile")).toBe(false);
    expect(ragnoScraper.matches("Marazzi")).toBe(false);
    expect(ragnoScraper.matches("Portobello")).toBe(false);
    // And not a substring match on something that merely starts the same way.
    expect(ragnoScraper.matches("Ragnola")).toBe(false);
  });

  it("scrape() builds a ragnousa.com search URL with the shape-first query and a /collections/ link selector", async () => {
    const { ragnoScraper } = await import("../src/services/scrapers/ragno.js");
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    const fetchMock = vi.mocked(mod.fetchProductImagePlaywright);

    const result = await ragnoScraper.scrape({
      brand: "Ragno",
      sku: null,
      style: "Lungarno",
      color: "Beige",
      notes: "12x24",
    });

    expect(result).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const opts = fetchMock.mock.calls[0]![0];
    expect(opts.searchUrl.startsWith("https://www.ragnousa.com/?s=")).toBe(true);
    // Shape (rectangle from 12x24) leads the query — disambiguator first.
    expect(decodeURIComponent(opts.searchUrl)).toContain("rectangle");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Lungarno");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Beige");
    // Collections are the canonical landing pages on ragnousa.com.
    expect(opts.productLinkSelector).toContain("/collections/");
    expect(opts.imageSelectors.length).toBeGreaterThan(0);
  });
});

describe("americanOleanScraper", () => {
  beforeEach(async () => {
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    vi.mocked(mod.fetchProductImagePlaywright).mockClear();
  });

  it("findScraper resolves the American Olean adapter by 'AO' and by full name", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    expect(findScraper("AO")?.brand).toBe("American Olean");
    expect(findScraper("American Olean")?.brand).toBe("American Olean");
  });

  it("matches 'AO' as a discrete token only, never as a prefix of unrelated brands", async () => {
    const { americanOleanScraper } = await import(
      "../src/services/scrapers/americanOlean.js"
    );
    // Accepted forms.
    expect(americanOleanScraper.matches("AO")).toBe(true);
    expect(americanOleanScraper.matches("ao")).toBe(true);
    expect(americanOleanScraper.matches(" AO ")).toBe(true); // trim
    expect(americanOleanScraper.matches("American Olean")).toBe(true);
    expect(americanOleanScraper.matches("american olean")).toBe(true);
    expect(americanOleanScraper.matches("AMERICAN OLEAN")).toBe(true);
    expect(americanOleanScraper.matches("americanolean")).toBe(true);
    // The whole point: "AO" must NOT match anything that merely starts with AO.
    expect(americanOleanScraper.matches("AO Smith Water Heater")).toBe(false);
    expect(americanOleanScraper.matches("AOSmith")).toBe(false);
    expect(americanOleanScraper.matches("Aon")).toBe(false);
    expect(americanOleanScraper.matches("Aoki")).toBe(false);
    // And not bleed into sibling brands.
    expect(americanOleanScraper.matches("Daltile")).toBe(false);
    expect(americanOleanScraper.matches("Marazzi")).toBe(false);
  });

  it("scrape() builds an americanolean.com search URL with the shape-first query and a /products/ link selector", async () => {
    const { americanOleanScraper } = await import(
      "../src/services/scrapers/americanOlean.js"
    );
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    const fetchMock = vi.mocked(mod.fetchProductImagePlaywright);

    const result = await americanOleanScraper.scrape({
      brand: "AO",
      sku: null,
      style: "Color Story Mosaics",
      color: "Navy",
      notes: "penny round",
    });

    expect(result).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const opts = fetchMock.mock.calls[0]![0];
    expect(opts.searchUrl.startsWith("https://www.americanolean.com/search?q=")).toBe(
      true,
    );
    // Penny round is a named shape — it must lead the query for the
    // pattern compositor to pick up the right texture later on.
    expect(decodeURIComponent(opts.searchUrl)).toContain("penny round");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Color Story Mosaics");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Navy");
    // /products/<category>/<series>/<variant> is the canonical detail URL.
    expect(opts.productLinkSelector).toContain("/products/");
    expect(opts.imageSelectors.length).toBeGreaterThan(0);
  });
});
