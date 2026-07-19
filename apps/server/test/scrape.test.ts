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

describe("floridaTileScraper", () => {
  beforeEach(async () => {
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    vi.mocked(mod.fetchProductImagePlaywright).mockClear();
  });

  it("findScraper resolves the Florida Tile adapter by exact brand", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    const s = findScraper("Florida Tile");
    expect(s).not.toBeNull();
    expect(s!.brand).toBe("Florida Tile");
  });

  it("matches 'Florida Tile' case-insensitively but not unrelated 'Florida ...' brands", async () => {
    const { floridaTileScraper } = await import(
      "../src/services/scrapers/floridaTile.js"
    );
    expect(floridaTileScraper.matches("Florida Tile")).toBe(true);
    expect(floridaTileScraper.matches("florida tile")).toBe(true);
    expect(floridaTileScraper.matches("FLORIDA TILE")).toBe(true);
    expect(floridaTileScraper.matches(" Florida Tile ")).toBe(true);
    // Legacy vendor-as-brand strings normalized away in bb058e5 — must NOT match.
    expect(floridaTileScraper.matches("Florida Ainslee")).toBe(false);
    expect(floridaTileScraper.matches("Florida")).toBe(false);
    // Sanity: don't bleed into sibling brands.
    expect(floridaTileScraper.matches("Daltile")).toBe(false);
    expect(floridaTileScraper.matches("Marazzi")).toBe(false);
  });

  it("scrape() builds a floridatile.com /product-search/ URL with the shape-first query and a /products/ link selector", async () => {
    const { floridaTileScraper } = await import(
      "../src/services/scrapers/floridaTile.js"
    );
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    const fetchMock = vi.mocked(mod.fetchProductImagePlaywright);

    const result = await floridaTileScraper.scrape({
      brand: "Florida Tile",
      sku: null,
      style: "Ainslee Park",
      color: "Calacatta Gold",
      notes: "12x24 polished",
    });

    expect(result).not.toBeNull();
    expect(result!.imageBuffer.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const opts = fetchMock.mock.calls[0]![0];
    expect(
      opts.searchUrl.startsWith("https://floridatile.com/product-search/?keyword="),
    ).toBe(true);
    // Shape (rectangle from 12x24) leads the query.
    expect(decodeURIComponent(opts.searchUrl)).toContain("rectangle");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Ainslee Park");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Calacatta Gold");
    // /products/<slug>/ is the canonical collection-detail URL.
    expect(opts.productLinkSelector).toContain("/products/");
    expect(opts.imageSelectors.length).toBeGreaterThan(0);
  });
});

describe("lungarnoScraper", () => {
  beforeEach(async () => {
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    vi.mocked(mod.fetchProductImagePlaywright).mockClear();
  });

  it("findScraper resolves the Lungarno adapter by exact brand", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    const s = findScraper("Lungarno");
    expect(s).not.toBeNull();
    expect(s!.brand).toBe("Lungarno");
  });

  it("matches 'Lungarno' on word boundary, not arbitrary Italian-named brands", async () => {
    const { lungarnoScraper } = await import(
      "../src/services/scrapers/lungarno.js"
    );
    expect(lungarnoScraper.matches("Lungarno")).toBe(true);
    expect(lungarnoScraper.matches("lungarno")).toBe(true);
    expect(lungarnoScraper.matches("LUNGARNO")).toBe(true);
    expect(lungarnoScraper.matches(" Lungarno ")).toBe(true);
    expect(lungarnoScraper.matches("Lungarno Ceramics")).toBe(true);
    // Sanity: don't bleed into other Italian-sounding tile brands.
    expect(lungarnoScraper.matches("Marazzi")).toBe(false);
    expect(lungarnoScraper.matches("Ragno")).toBe(false);
    expect(lungarnoScraper.matches("Sartoria")).toBe(false);
    // And not a substring match on a prefix.
    expect(lungarnoScraper.matches("Lungarnoid")).toBe(false);
  });

  it("scrape() builds a thelungarno.com ?s= search URL with the shape-first query", async () => {
    const { lungarnoScraper } = await import(
      "../src/services/scrapers/lungarno.js"
    );
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    const fetchMock = vi.mocked(mod.fetchProductImagePlaywright);

    const result = await lungarnoScraper.scrape({
      brand: "Lungarno",
      sku: null,
      style: "Zellige Classique",
      color: "Bone",
      notes: "subway 2x6",
    });

    expect(result).not.toBeNull();
    expect(result!.imageBuffer.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const opts = fetchMock.mock.calls[0]![0];
    expect(opts.searchUrl.startsWith("https://thelungarno.com/?s=")).toBe(true);
    // Subway is a named shape — it must lead the query.
    expect(decodeURIComponent(opts.searchUrl)).toContain("subway");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Zellige Classique");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Bone");
    expect(opts.imageSelectors.length).toBeGreaterThan(0);
  });
});

describe("marbleSystemsScraper", () => {
  beforeEach(async () => {
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    vi.mocked(mod.fetchProductImagePlaywright).mockClear();
  });

  it("findScraper resolves the Marble Systems adapter by exact brand", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    const s = findScraper("Marble Systems");
    expect(s).not.toBeNull();
    expect(s!.brand).toBe("Marble Systems");
  });

  it("requires both 'marble' and 'systems' — never matches either word alone", async () => {
    const { marbleSystemsScraper } = await import(
      "../src/services/scrapers/marbleSystems.js"
    );
    expect(marbleSystemsScraper.matches("Marble Systems")).toBe(true);
    expect(marbleSystemsScraper.matches("marble systems")).toBe(true);
    expect(marbleSystemsScraper.matches("MARBLE SYSTEMS")).toBe(true);
    expect(marbleSystemsScraper.matches(" Marble  Systems ")).toBe(true);
    // The whole point of the tight matcher: must NOT match "marble" or
    // "systems" in isolation, nor unrelated vendors using either word.
    expect(marbleSystemsScraper.matches("Marble")).toBe(false);
    expect(marbleSystemsScraper.matches("Systems")).toBe(false);
    expect(marbleSystemsScraper.matches("Italian Marble")).toBe(false);
    expect(marbleSystemsScraper.matches("Sonoma Systems")).toBe(false);
    // Sanity: don't bleed into other brands.
    expect(marbleSystemsScraper.matches("Daltile")).toBe(false);
    expect(marbleSystemsScraper.matches("Marazzi")).toBe(false);
  });

  it("scrape() builds a marblesystems.com ?s= search URL with the shape-first query and a /product/ link selector", async () => {
    const { marbleSystemsScraper } = await import(
      "../src/services/scrapers/marbleSystems.js"
    );
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    const fetchMock = vi.mocked(mod.fetchProductImagePlaywright);

    const result = await marbleSystemsScraper.scrape({
      brand: "Marble Systems",
      sku: null,
      style: "Belvedere",
      color: "Beach",
      notes: "12x24",
    });

    expect(result).not.toBeNull();
    expect(result!.imageBuffer.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const opts = fetchMock.mock.calls[0]![0];
    expect(opts.searchUrl.startsWith("https://www.marblesystems.com/?s=")).toBe(
      true,
    );
    // Shape (rectangle from 12x24) leads the query.
    expect(decodeURIComponent(opts.searchUrl)).toContain("rectangle");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Belvedere");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Beach");
    // Singular /product/<slug>/ is the canonical detail URL.
    expect(opts.productLinkSelector).toContain("/product/");
    // But it should NOT navigate to /products/ (plural) — that's an unrelated path.
    expect(opts.productLinkSelector).not.toContain("/products/");
    expect(opts.imageSelectors.length).toBeGreaterThan(0);
  });
});

describe("maniscalcoScraper", () => {
  beforeEach(async () => {
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    vi.mocked(mod.fetchProductImagePlaywright).mockClear();
  });

  it("findScraper resolves the Maniscalco adapter by exact brand", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    const s = findScraper("Maniscalco");
    expect(s).not.toBeNull();
    expect(s!.brand).toBe("Maniscalco");
  });

  it("matches 'Maniscalco' on word boundary, with suffix variants but not arbitrary prefixes", async () => {
    const { maniscalcoScraper } = await import(
      "../src/services/scrapers/maniscalco.js"
    );
    expect(maniscalcoScraper.matches("Maniscalco")).toBe(true);
    expect(maniscalcoScraper.matches("maniscalco")).toBe(true);
    expect(maniscalcoScraper.matches("MANISCALCO")).toBe(true);
    expect(maniscalcoScraper.matches(" Maniscalco ")).toBe(true);
    expect(maniscalcoScraper.matches("Maniscalco Stone")).toBe(true);
    expect(maniscalcoScraper.matches("Maniscalco Tile")).toBe(true);
    // Sanity: don't bleed into other brands.
    expect(maniscalcoScraper.matches("Daltile")).toBe(false);
    expect(maniscalcoScraper.matches("Marazzi")).toBe(false);
    // And not a substring match on a prefix.
    expect(maniscalcoScraper.matches("Maniscalcola")).toBe(false);
  });

  it("scrape() builds a maniscalcostone.com ?s= search URL with the shape-first query and a /product/ link selector", async () => {
    const { maniscalcoScraper } = await import(
      "../src/services/scrapers/maniscalco.js"
    );
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    const fetchMock = vi.mocked(mod.fetchProductImagePlaywright);

    const result = await maniscalcoScraper.scrape({
      brand: "Maniscalco",
      sku: null,
      style: "Chameleon",
      color: "Opal",
      notes: "penny round",
    });

    expect(result).not.toBeNull();
    expect(result!.imageBuffer.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const opts = fetchMock.mock.calls[0]![0];
    expect(opts.searchUrl.startsWith("https://www.maniscalcostone.com/?s=")).toBe(
      true,
    );
    // Penny round is a named shape — it must lead the query.
    expect(decodeURIComponent(opts.searchUrl)).toContain("penny round");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Chameleon");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Opal");
    // Singular /product/<slug>/ is the canonical detail URL.
    expect(opts.productLinkSelector).toContain("/product/");
    expect(opts.imageSelectors.length).toBeGreaterThan(0);
  });
});

describe("sartoriaScraper", () => {
  beforeEach(async () => {
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    vi.mocked(mod.fetchProductImagePlaywright).mockClear();
  });

  it("findScraper resolves the Sartoria adapter by exact brand", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    const s = findScraper("Sartoria");
    expect(s).not.toBeNull();
    expect(s!.brand).toBe("Sartoria");
  });

  it("matches 'Sartoria' on word boundary, never 'sartorial' or arbitrary tokens", async () => {
    const { sartoriaScraper } = await import(
      "../src/services/scrapers/sartoria.js"
    );
    expect(sartoriaScraper.matches("Sartoria")).toBe(true);
    expect(sartoriaScraper.matches("sartoria")).toBe(true);
    expect(sartoriaScraper.matches("SARTORIA")).toBe(true);
    expect(sartoriaScraper.matches(" Sartoria ")).toBe(true);
    expect(sartoriaScraper.matches("Sartoria Materici")).toBe(true);
    expect(sartoriaScraper.matches("Sartoria Tbrick")).toBe(true);
    // The whole point of the word-boundary anchor — these must NOT match.
    expect(sartoriaScraper.matches("sartorial")).toBe(false);
    expect(sartoriaScraper.matches("Sartorialist")).toBe(false);
    // Sanity: don't bleed into other Italian-sounding tile brands.
    expect(sartoriaScraper.matches("Lungarno")).toBe(false);
    expect(sartoriaScraper.matches("Marazzi")).toBe(false);
    expect(sartoriaScraper.matches("Ragno")).toBe(false);
  });

  it("scrape() builds a terratintagroup.com ?s= search URL with the shape-first query and a /collections/ link selector", async () => {
    const { sartoriaScraper } = await import(
      "../src/services/scrapers/sartoria.js"
    );
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    const fetchMock = vi.mocked(mod.fetchProductImagePlaywright);

    const result = await sartoriaScraper.scrape({
      brand: "Sartoria",
      sku: null,
      style: "Materici",
      color: "Latte",
      notes: "subway 2x10 glossy",
    });

    expect(result).not.toBeNull();
    expect(result!.imageBuffer.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const opts = fetchMock.mock.calls[0]![0];
    expect(
      opts.searchUrl.startsWith("https://www.terratintagroup.com/?s="),
    ).toBe(true);
    // Subway is a named shape — it must lead the query.
    expect(decodeURIComponent(opts.searchUrl)).toContain("subway");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Materici");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Latte");
    // Collections are the canonical landing pages on terratintagroup.com.
    expect(opts.productLinkSelector).toContain("/collections/");
    expect(opts.imageSelectors.length).toBeGreaterThan(0);
  });
});

describe("sonomaTilemakersScraper", () => {
  beforeEach(async () => {
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    vi.mocked(mod.fetchProductImagePlaywright).mockClear();
  });

  it("findScraper resolves the Sonoma Tilemakers adapter by exact brand", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    const s = findScraper("Sonoma Tilemakers");
    expect(s).not.toBeNull();
    expect(s!.brand).toBe("Sonoma Tilemakers");
  });

  it("requires both 'sonoma' and 'tilemakers' — never matches either word alone", async () => {
    const { sonomaTilemakersScraper } = await import(
      "../src/services/scrapers/sonomaTilemakers.js"
    );
    expect(sonomaTilemakersScraper.matches("Sonoma Tilemakers")).toBe(true);
    expect(sonomaTilemakersScraper.matches("sonoma tilemakers")).toBe(true);
    expect(sonomaTilemakersScraper.matches("SONOMA TILEMAKERS")).toBe(true);
    expect(sonomaTilemakersScraper.matches(" Sonoma  Tilemakers ")).toBe(true);
    // The whole point of the tight matcher: must NOT match either word alone,
    // nor unrelated vendors sharing the "Sonoma" prefix.
    expect(sonomaTilemakersScraper.matches("Sonoma")).toBe(false);
    expect(sonomaTilemakersScraper.matches("Tilemakers")).toBe(false);
    expect(sonomaTilemakersScraper.matches("Sonoma Cast Stone")).toBe(false);
    // Sanity: don't bleed into sibling brands.
    expect(sonomaTilemakersScraper.matches("Daltile")).toBe(false);
    expect(sonomaTilemakersScraper.matches("Marazzi")).toBe(false);
  });

  it("scrape() builds a sonomatilemakers.com ?s= search URL with the shape-first query and a /product/ link selector", async () => {
    const { sonomaTilemakersScraper } = await import(
      "../src/services/scrapers/sonomaTilemakers.js"
    );
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    const fetchMock = vi.mocked(mod.fetchProductImagePlaywright);

    const result = await sonomaTilemakersScraper.scrape({
      brand: "Sonoma Tilemakers",
      sku: null,
      style: "Hustle Shimmie",
      color: "Fandango",
      notes: "2x4",
    });

    expect(result).not.toBeNull();
    expect(result!.imageBuffer.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const opts = fetchMock.mock.calls[0]![0];
    expect(opts.searchUrl.startsWith("https://sonomatilemakers.com/?s=")).toBe(
      true,
    );
    // Shape (rectangle from 2x4) leads the query.
    expect(decodeURIComponent(opts.searchUrl)).toContain("rectangle");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Hustle Shimmie");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Fandango");
    // Singular /product/<slug>/ is the canonical detail URL.
    expect(opts.productLinkSelector).toContain("/product/");
    expect(opts.imageSelectors.length).toBeGreaterThan(0);
  });
});

describe("cepacScraper", () => {
  beforeEach(async () => {
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    vi.mocked(mod.fetchProductImagePlaywright).mockClear();
  });

  it("findScraper resolves the Cepac adapter by exact brand", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    const s = findScraper("Cepac");
    expect(s).not.toBeNull();
    expect(s!.brand).toBe("Cepac");
  });

  it("matches 'Cepac' as a discrete token only, never as a prefix of unrelated words", async () => {
    const { cepacScraper } = await import("../src/services/scrapers/cepac.js");
    expect(cepacScraper.matches("Cepac")).toBe(true);
    expect(cepacScraper.matches("cepac")).toBe(true);
    expect(cepacScraper.matches("CEPAC")).toBe(true);
    expect(cepacScraper.matches(" Cepac ")).toBe(true);
    expect(cepacScraper.matches("Cepac Tile")).toBe(true);
    expect(cepacScraper.matches("cepac tile")).toBe(true);
    // The whole point of the word-boundary anchor — these must NOT match.
    expect(cepacScraper.matches("Cepacol")).toBe(false);
    expect(cepacScraper.matches("Cepacia")).toBe(false);
    // Sanity: don't bleed into other brands.
    expect(cepacScraper.matches("Daltile")).toBe(false);
    expect(cepacScraper.matches("Marazzi")).toBe(false);
  });

  it("scrape() builds a cepactile.com ?s= search URL with the shape-first query and a /product/ link selector", async () => {
    const { cepacScraper } = await import("../src/services/scrapers/cepac.js");
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    const fetchMock = vi.mocked(mod.fetchProductImagePlaywright);

    const result = await cepacScraper.scrape({
      brand: "Cepac",
      sku: null,
      style: "Krave",
      color: "Sugar",
      notes: "0.5x2 stagger joint",
    });

    expect(result).not.toBeNull();
    expect(result!.imageBuffer.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const opts = fetchMock.mock.calls[0]![0];
    expect(opts.searchUrl.startsWith("https://cepactile.com/?s=")).toBe(true);
    // Shape (rectangle from 0.5x2) leads the query.
    expect(decodeURIComponent(opts.searchUrl)).toContain("rectangle");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Krave");
    expect(decodeURIComponent(opts.searchUrl)).toContain("Sugar");
    // Singular /product/<slug>/ is the canonical detail URL.
    expect(opts.productLinkSelector).toContain("/product/");
    expect(opts.imageSelectors.length).toBeGreaterThan(0);
  });
});

describe("conradBrickScraper", () => {
  beforeEach(async () => {
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    vi.mocked(mod.fetchProductImagePlaywright).mockClear();
  });

  it("findScraper resolves the Conrad Brick adapter by exact brand", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    const s = findScraper("Conrad Brick");
    expect(s).not.toBeNull();
    expect(s!.brand).toBe("Conrad Brick");
  });

  it("matches 'Conrad Brick' on word boundary, case-insensitively", async () => {
    const { conradBrickScraper } = await import(
      "../src/services/scrapers/conradBrick.js"
    );
    expect(conradBrickScraper.matches("Conrad Brick")).toBe(true);
    expect(conradBrickScraper.matches("conrad brick")).toBe(true);
    expect(conradBrickScraper.matches("CONRAD BRICK")).toBe(true);
    expect(conradBrickScraper.matches(" Conrad Brick ")).toBe(true);
    expect(conradBrickScraper.matches("Conrad Brick Tile")).toBe(true);
    expect(conradBrickScraper.matches("American Olean")).toBe(false);
    expect(conradBrickScraper.matches("Brick")).toBe(false);
    expect(conradBrickScraper.matches("Conrad")).toBe(false);
    expect(conradBrickScraper.matches("Daltile")).toBe(false);
  });

  it("scrape() returns null when there is nothing to query on", async () => {
    const { conradBrickScraper } = await import(
      "../src/services/scrapers/conradBrick.js"
    );
    const result = await conradBrickScraper.scrape({
      brand: "Conrad Brick",
      sku: null,
      style: null,
      color: null,
      size: null,
      notes: null,
    });
    expect(result).toBeNull();
  });

  it("scrape() builds an americanolean.com /search URL scoped to the collection with a Conrad Brick PDP link selector", async () => {
    const { conradBrickScraper } = await import(
      "../src/services/scrapers/conradBrick.js"
    );
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    const fetchMock = vi.mocked(mod.fetchProductImagePlaywright);

    const result = await conradBrickScraper.scrape({
      brand: "Conrad Brick",
      sku: null,
      style: "Conrad Brick",
      color: "Polar",
      notes: "2.25x8 glossy",
    });

    expect(result).not.toBeNull();
    expect(result!.imageBuffer.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const opts = fetchMock.mock.calls[0]![0];
    expect(
      opts.searchUrl.startsWith("https://www.americanolean.com/search?q="),
    ).toBe(true);
    expect(decodeURIComponent(opts.searchUrl).toLowerCase()).toContain(
      "conrad brick",
    );
    expect(decodeURIComponent(opts.searchUrl)).toContain("Polar");
    expect(opts.productLinkSelector).toContain("/products/wall/conrad-brick");
    expect(opts.imageSelectors.length).toBeGreaterThan(0);
  });
});

describe("sherwinWilliamsScraper", () => {
  beforeEach(async () => {
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    vi.mocked(mod.fetchProductImagePlaywright).mockClear();
  });

  it("declares trade='paint' (opens the first non-tile trade)", async () => {
    const { sherwinWilliamsScraper } = await import(
      "../src/services/scrapers/sherwinWilliams.js"
    );
    expect(sherwinWilliamsScraper.trade).toBe("paint");
  });

  it("findScraper resolves SW by full name, hyphen variant, and the 'SW' token", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    expect(findScraper("Sherwin-Williams")?.brand).toBe("Sherwin-Williams");
    expect(findScraper("Sherwin Williams")?.brand).toBe("Sherwin-Williams");
    expect(findScraper("SW")?.brand).toBe("Sherwin-Williams");
  });

  it("findScraper with trade='paint' returns SW, and with trade='tile' returns null", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    expect(findScraper("Sherwin-Williams", "paint")?.brand).toBe(
      "Sherwin-Williams",
    );
    // Trade gate prevents a paint brand from satisfying a tile lookup.
    expect(findScraper("Sherwin-Williams", "tile")).toBeNull();
  });

  it("matches SW brand variants case-insensitively but not unrelated 'SW...' brands", async () => {
    const { sherwinWilliamsScraper } = await import(
      "../src/services/scrapers/sherwinWilliams.js"
    );
    // Accepted forms.
    expect(sherwinWilliamsScraper.matches("Sherwin-Williams")).toBe(true);
    expect(sherwinWilliamsScraper.matches("sherwin-williams")).toBe(true);
    expect(sherwinWilliamsScraper.matches("SHERWIN-WILLIAMS")).toBe(true);
    expect(sherwinWilliamsScraper.matches("Sherwin Williams")).toBe(true);
    expect(sherwinWilliamsScraper.matches("sherwinwilliams")).toBe(true);
    expect(sherwinWilliamsScraper.matches("SW")).toBe(true);
    expect(sherwinWilliamsScraper.matches("sw")).toBe(true);
    expect(sherwinWilliamsScraper.matches(" SW ")).toBe(true);
    // "SW" must be a discrete token, not a prefix of another brand.
    expect(sherwinWilliamsScraper.matches("SW Fitness")).toBe(false);
    expect(sherwinWilliamsScraper.matches("SWAG")).toBe(false);
    expect(sherwinWilliamsScraper.matches("Sherwood")).toBe(false);
    // Sanity: don't bleed into tile brands.
    expect(sherwinWilliamsScraper.matches("Daltile")).toBe(false);
    expect(sherwinWilliamsScraper.matches("Benjamin Moore")).toBe(false);
  });

  it("scrape() returns null when there is nothing to query on", async () => {
    const { sherwinWilliamsScraper } = await import(
      "../src/services/scrapers/sherwinWilliams.js"
    );
    const result = await sherwinWilliamsScraper.scrape({
      brand: "Sherwin-Williams",
      sku: null,
      style: null,
      color: null,
      size: null,
      notes: null,
    });
    expect(result).toBeNull();
  });

  it("scrape() builds a sherwin-williams.com search URL keyed off sku+color (not shape)", async () => {
    const { sherwinWilliamsScraper } = await import(
      "../src/services/scrapers/sherwinWilliams.js"
    );
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    const fetchMock = vi.mocked(mod.fetchProductImagePlaywright);

    const result = await sherwinWilliamsScraper.scrape({
      brand: "Sherwin-Williams",
      sku: "SW 7008",
      style: null,
      color: "Alabaster",
      // Notes contains a tile-ish size; paint scrapers must ignore shape inference.
      notes: "12x24 eggshell",
    });

    expect(result).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const opts = fetchMock.mock.calls[0]![0];
    expect(
      opts.searchUrl.startsWith(
        "https://www.sherwin-williams.com/en-us/color/search?searchQuery=",
      ),
    ).toBe(true);
    const decoded = decodeURIComponent(opts.searchUrl);
    expect(decoded).toContain("SW 7008");
    expect(decoded).toContain("Alabaster");
    // Paint adapters MUST NOT inject shape from notes — that's tile-only logic.
    expect(decoded).not.toContain("rectangle");
    expect(opts.productLinkSelector).toContain("/en-us/color/color-family/");
    expect(opts.imageSelectors.length).toBeGreaterThan(0);
  });
});

describe("benjaminMooreScraper", () => {
  beforeEach(async () => {
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    vi.mocked(mod.fetchProductImagePlaywright).mockClear();
  });

  it("declares trade='paint'", async () => {
    const { benjaminMooreScraper } = await import(
      "../src/services/scrapers/benjaminMoore.js"
    );
    expect(benjaminMooreScraper.trade).toBe("paint");
  });

  it("findScraper resolves Benjamin Moore by full name and the 'BM' token", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    expect(findScraper("Benjamin Moore")?.brand).toBe("Benjamin Moore");
    expect(findScraper("BM")?.brand).toBe("Benjamin Moore");
  });

  it("findScraper with trade='paint' returns BM, and with trade='tile' returns null", async () => {
    const { findScraper } = await import("../src/services/scrapers/index.js");
    expect(findScraper("Benjamin Moore", "paint")?.brand).toBe(
      "Benjamin Moore",
    );
    expect(findScraper("Benjamin Moore", "tile")).toBeNull();
  });

  it("matches BM brand variants case-insensitively but not 'BMW' or 'BMC'", async () => {
    const { benjaminMooreScraper } = await import(
      "../src/services/scrapers/benjaminMoore.js"
    );
    expect(benjaminMooreScraper.matches("Benjamin Moore")).toBe(true);
    expect(benjaminMooreScraper.matches("benjamin moore")).toBe(true);
    expect(benjaminMooreScraper.matches("BENJAMIN MOORE")).toBe(true);
    expect(benjaminMooreScraper.matches("benjaminmoore")).toBe(true);
    expect(benjaminMooreScraper.matches("BM")).toBe(true);
    expect(benjaminMooreScraper.matches("bm")).toBe(true);
    expect(benjaminMooreScraper.matches(" BM ")).toBe(true);
    // "BM" must be a discrete token — never a prefix of unrelated brands.
    expect(benjaminMooreScraper.matches("BMW")).toBe(false);
    expect(benjaminMooreScraper.matches("BMC")).toBe(false);
    expect(benjaminMooreScraper.matches("Benji")).toBe(false);
    // Sanity: don't bleed into the other paint brand or any tile brand.
    expect(benjaminMooreScraper.matches("Sherwin-Williams")).toBe(false);
    expect(benjaminMooreScraper.matches("Daltile")).toBe(false);
  });

  it("scrape() returns null when there is nothing to query on", async () => {
    const { benjaminMooreScraper } = await import(
      "../src/services/scrapers/benjaminMoore.js"
    );
    const result = await benjaminMooreScraper.scrape({
      brand: "Benjamin Moore",
      sku: null,
      style: null,
      color: null,
      size: null,
      notes: null,
    });
    expect(result).toBeNull();
  });

  it("scrape() builds a benjaminmoore.com search URL keyed off sku+color", async () => {
    const { benjaminMooreScraper } = await import(
      "../src/services/scrapers/benjaminMoore.js"
    );
    const mod = await import("../src/services/scrapers/playwrightFetch.js");
    const fetchMock = vi.mocked(mod.fetchProductImagePlaywright);

    const result = await benjaminMooreScraper.scrape({
      brand: "Benjamin Moore",
      sku: "HC-145",
      style: null,
      color: "Van Courtland Blue",
      notes: "satin trim — ignore shape tokens like subway",
    });

    expect(result).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const opts = fetchMock.mock.calls[0]![0];
    expect(
      opts.searchUrl.startsWith(
        "https://www.benjaminmoore.com/en-us/paint-colors/search?query=",
      ),
    ).toBe(true);
    const decoded = decodeURIComponent(opts.searchUrl);
    expect(decoded).toContain("HC-145");
    expect(decoded).toContain("Van Courtland Blue");
    // Paint adapters MUST NOT inject shape from notes — that's tile-only logic.
    expect(decoded).not.toContain("subway");
    expect(opts.productLinkSelector).toContain("/paint-colors/color/");
    expect(opts.imageSelectors.length).toBeGreaterThan(0);
  });
});

describe("registeredBrands() — trade filtering", () => {
  it("with no argument, lists every adapter (tile + paint)", async () => {
    const { registeredBrands } = await import(
      "../src/services/scrapers/index.js"
    );
    const all = registeredBrands();
    expect(all).toContain("Daltile");
    expect(all).toContain("Sherwin-Williams");
    expect(all).toContain("Benjamin Moore");
  });

  it("with trade='tile', omits paint adapters", async () => {
    const { registeredBrands } = await import(
      "../src/services/scrapers/index.js"
    );
    const tile = registeredBrands("tile");
    expect(tile).toContain("Daltile");
    expect(tile).not.toContain("Sherwin-Williams");
    expect(tile).not.toContain("Benjamin Moore");
  });

  it("with trade='paint', returns only paint adapters", async () => {
    const { registeredBrands } = await import(
      "../src/services/scrapers/index.js"
    );
    const paint = registeredBrands("paint");
    expect(paint).toEqual(
      expect.arrayContaining(["Sherwin-Williams", "Benjamin Moore"]),
    );
    expect(paint).not.toContain("Daltile");
    expect(paint).not.toContain("Marazzi");
  });
});
