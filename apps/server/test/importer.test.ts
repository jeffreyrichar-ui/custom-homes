import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exampleProject } from "@custom-homes/shared";
import { makeDbi } from "../src/db/dbi.js";
import * as sqliteSchema from "../src/db/schema.sqlite.js";
import { runImport } from "../src/services/importer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(__dirname, "../src/db/migrations/sqlite");

function freshDb() {
  const client = new Database(":memory:");
  client.pragma("journal_mode = MEMORY");
  client.pragma("foreign_keys = ON");
  const d = drizzle(client, { schema: sqliteSchema });
  migrate(d, { migrationsFolder: MIGRATIONS });
  const dbi = makeDbi({ kind: "sqlite", client, drizzle: d, schema: sqliteSchema });
  return { client, dbi };
}

describe("runImport", () => {
  let ctx: ReturnType<typeof freshDb>;

  beforeEach(() => {
    ctx = freshDb();
  });
  afterEach(() => {
    ctx.client.close();
  });

  it("imports the example project end-to-end", async () => {
    const result = await runImport(ctx.dbi, exampleProject, { dryRun: false });

    expect(result.errors).toEqual([]);
    expect(result.project_id).toBeTruthy();
    expect(result.summary.projects).toMatchObject({ created: 1, updated: 0 });
    expect(result.summary.rooms).toMatchObject({ created: 2, updated: 0 });
    expect(result.summary.tile_entries.created).toBe(3);
    expect(result.summary.paint_entries.created).toBe(3);
    expect(result.summary.cabinet_entries.created).toBe(2);
    expect(result.summary.countertop_entries.created).toBe(2);
    expect(result.summary.hardwood_entries.created).toBe(1);

    const projects = await ctx.dbi.query("SELECT * FROM projects");
    expect(projects).toHaveLength(1);
    const tiles = await ctx.dbi.query("SELECT * FROM tile_entries");
    expect(tiles).toHaveLength(3);
  });

  it("re-import is idempotent — second run reports updates", async () => {
    const first = await runImport(ctx.dbi, exampleProject, { dryRun: false });
    expect(first.errors).toEqual([]);
    const tilesBefore = await ctx.dbi.query("SELECT COUNT(*) AS c FROM tile_entries");
    const second = await runImport(ctx.dbi, exampleProject, { dryRun: false });
    const tilesAfter = await ctx.dbi.query("SELECT COUNT(*) AS c FROM tile_entries");

    expect(second.errors).toEqual([]);
    expect(second.summary.projects).toMatchObject({ created: 0, updated: 1 });
    expect(second.summary.rooms).toMatchObject({ created: 0, updated: 2 });
    expect(second.summary.tile_entries).toMatchObject({ created: 0, updated: 3 });
    expect(tilesAfter).toEqual(tilesBefore);
  });

  it("re-import stays idempotent when fallback-key fields are null", async () => {
    // `col = NULL` is never true in SQL — entries with a null color/sku
    // used to miss their existing row on re-import and duplicate.
    const payload = {
      project: { name: "Null Key House", address: "2 Null Way" },
      rooms: [
        {
          room_name: "Guest Bath",
          entries: [
            {
              trade: "tile",
              brand: "Portobello",
              style: "Charlestone",
              color: null,
              sku: null,
              location_in_room: "floor",
            },
          ],
        },
      ],
    };
    const first = await runImport(ctx.dbi, payload, { dryRun: false });
    expect(first.errors).toEqual([]);
    expect(first.summary.tile_entries).toMatchObject({ created: 1, updated: 0 });

    const second = await runImport(ctx.dbi, payload, { dryRun: false });
    expect(second.errors).toEqual([]);
    expect(second.summary.tile_entries).toMatchObject({ created: 0, updated: 1 });

    const tiles = await ctx.dbi.query("SELECT * FROM tile_entries");
    expect(tiles).toHaveLength(1);
  });

  it("dry-run rolls back — no rows persist", async () => {
    const result = await runImport(ctx.dbi, exampleProject, { dryRun: true });
    expect(result.errors).toEqual([]);
    expect(result.summary.tile_entries.created).toBe(3);

    const projects = await ctx.dbi.query("SELECT * FROM projects");
    expect(projects).toHaveLength(0);
    const tiles = await ctx.dbi.query("SELECT * FROM tile_entries");
    expect(tiles).toHaveLength(0);
  });

  it("collects per-entry validation errors without aborting siblings", async () => {
    const payload = {
      project: { name: "Test House", address: "1 Test Way" },
      rooms: [
        {
          room_name: "Kitchen",
          entries: [
            {
              trade: "tile",
              brand: "MSI",
              location_in_room: "floor",
            },
            {
              trade: "tile",
              // missing required `brand` and `location_in_room`
              style: "broken",
            },
            {
              trade: "paint",
              brand: "Sherwin-Williams",
              color_name: "Naval",
              sheen: "satin",
              surface_application: "walls",
            },
            {
              trade: "not-a-real-trade",
              brand: "X",
            },
          ],
        },
      ],
    };

    const result = await runImport(ctx.dbi, payload, { dryRun: false });

    expect(result.summary.tile_entries.created).toBe(1);
    expect(result.summary.tile_entries.failed).toBe(1);
    expect(result.summary.paint_entries.created).toBe(1);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain("unknown_trade");
  });

  it("matches existing project by external_id even if name/address differ", async () => {
    const v1 = {
      external_id: "BT-job-9",
      external_source: "buildertrend",
      project: { name: "Old Name", address: "123 Old" },
      rooms: [],
    };
    const v2 = {
      external_id: "BT-job-9",
      external_source: "buildertrend",
      project: { name: "New Name", address: "456 New" },
      rooms: [],
    };

    const r1 = await runImport(ctx.dbi, v1, { dryRun: false });
    const r2 = await runImport(ctx.dbi, v2, { dryRun: false });

    expect(r1.project_id).toBe(r2.project_id);
    expect(r1.summary.projects).toMatchObject({ created: 1, updated: 0 });
    expect(r2.summary.projects).toMatchObject({ created: 0, updated: 1 });

    const projects = await ctx.dbi.query<{ name: string; address: string }>(
      "SELECT name, address FROM projects",
    );
    expect(projects).toHaveLength(1);
    expect(projects[0]?.name).toBe("New Name");
  });

  it("returns top-level error on malformed payload", async () => {
    const result = await runImport(ctx.dbi, { not: "a project" }, { dryRun: false });
    expect(result.project_id).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("persists the tile vendor field round-trip", async () => {
    const payload = {
      project: { name: "Vendor Test", address: "1 Test St" },
      rooms: [
        {
          room_name: "Master Bath",
          entries: [
            {
              trade: "tile",
              vendor: "Masonry Center",
              brand: "Marazzi",
              style: "Persuade PS 41",
              color: "Beige Matte",
              location_in_room: "floor",
            },
          ],
        },
      ],
    };
    const result = await runImport(ctx.dbi, payload, { dryRun: false });
    expect(result.errors).toEqual([]);
    const rows = await ctx.dbi.query<{ vendor: string | null; brand: string }>(
      "SELECT vendor, brand FROM tile_entries WHERE brand = $1",
      ["Marazzi"],
    );
    expect(rows[0]?.vendor).toBe("Masonry Center");
    expect(rows[0]?.brand).toBe("Marazzi");
  });
});
