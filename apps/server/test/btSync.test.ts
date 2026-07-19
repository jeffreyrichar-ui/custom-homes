import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { exampleProject, btSnapshotSchema, type BtSnapshot } from "@custom-homes/shared";
import { makeDbi } from "../src/db/dbi.js";
import * as sqliteSchema from "../src/db/schema.sqlite.js";
import { runImport } from "../src/services/importer.js";
import { runBtSync } from "../src/services/buildertrend/sync.js";
import { makeFixtureBtClient, type BtClient } from "../src/services/buildertrend/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(__dirname, "../src/db/migrations/sqlite");
const FIXTURE = path.resolve(__dirname, "../../../seed/buildertrend/snapshot.json");

function freshDb() {
  const client = new Database(":memory:");
  client.pragma("journal_mode = MEMORY");
  client.pragma("foreign_keys = ON");
  const d = drizzle(client, { schema: sqliteSchema });
  migrate(d, { migrationsFolder: MIGRATIONS });
  const dbi = makeDbi({ kind: "sqlite", client, drizzle: d, schema: sqliteSchema });
  return { client, dbi };
}

const staticClient = (snapshot: BtSnapshot): BtClient => ({
  fetchSnapshot: async () => snapshot,
});

describe("runBtSync", () => {
  let ctx: ReturnType<typeof freshDb>;

  beforeEach(() => {
    ctx = freshDb();
  });
  afterEach(() => {
    ctx.client.close();
  });

  it("fixture snapshot parses against the shared contract", async () => {
    const client = makeFixtureBtClient(FIXTURE);
    const snap = await client.fetchSnapshot();
    expect(btSnapshotSchema.safeParse(snap).success).toBe(true);
    expect(snap.jobs.length).toBeGreaterThanOrEqual(2);
  });

  it("creates a new project with rooms and product-backed entries", async () => {
    const report = await runBtSync(ctx.dbi, makeFixtureBtClient(FIXTURE));

    expect(report.projects.created).toBe(2); // no prior data in this db
    const caldwell = await ctx.dbi.query<{ id: string; external_id: string }>(
      `SELECT id, external_id FROM projects WHERE external_id = 'BT-job-2088'`,
    );
    expect(caldwell).toHaveLength(1);

    const rooms = await ctx.dbi.query<{ room_name: string }>(
      `SELECT room_name FROM rooms WHERE project_id = $1 ORDER BY room_name`,
      [caldwell[0]!.id],
    );
    // Kitchen (allowance-only cabinet sel) and Mudroom (unmapped) still
    // create their rooms; Primary Bath carries the two real entries.
    expect(rooms.map((r) => r.room_name)).toEqual(["Kitchen", "Mudroom", "Primary Bath"]);

    const tiles = await ctx.dbi.query<{ brand: string; allowance: number; status: string; external_id: string }>(
      `SELECT brand, allowance, status, external_id FROM tile_entries WHERE external_id = 'BT-sel-9101'`,
    );
    expect(tiles).toHaveLength(1);
    expect(tiles[0]!.brand).toBe("Bedrosians");
    expect(Number(tiles[0]!.allowance)).toBe(1800);
    expect(tiles[0]!.status).toBe("pending_selection");

    const paints = await ctx.dbi.query(
      `SELECT id FROM paint_entries WHERE external_id = 'BT-sel-9102'`,
    );
    expect(paints).toHaveLength(1);
  });

  it("matches the existing imported project by external id and updates it", async () => {
    await runImport(ctx.dbi, exampleProject, { dryRun: false }); // seeds BT-job-1042
    const before = await ctx.dbi.query(`SELECT id FROM projects`);

    const report = await runBtSync(ctx.dbi, makeFixtureBtClient(FIXTURE));
    expect(report.projects.updated).toBe(1);
    expect(report.projects.created).toBe(1);

    const after = await ctx.dbi.query(`SELECT id FROM projects`);
    expect(after.length).toBe(before.length + 1);

    const henderson = await ctx.dbi.query<{ synced_at: string | null }>(
      `SELECT synced_at FROM projects WHERE external_id = 'BT-job-1042'`,
    );
    expect(henderson[0]!.synced_at).not.toBeNull();

    // The imported Henderson already had the Daltile MA85 shower tile as a
    // local entry — sync must ADOPT it (link the BT id, take the commercial
    // columns), not insert a natural-key duplicate.
    const adopted = await ctx.dbi.query<{
      external_id: string | null;
      allowance: number | null;
      n: number | string;
    }>(
      `SELECT external_id, allowance, COUNT(*) OVER () AS n FROM tile_entries
       WHERE brand = 'Daltile' AND sku = 'MA85' AND location_in_room = 'shower_walls'`,
    );
    expect(adopted).toHaveLength(1);
    expect(adopted[0]!.external_id).toBe("BT-sel-9001");
    expect(Number(adopted[0]!.allowance)).toBe(2200);
  });

  it("never clobbers Tamara's design fields on an already-synced entry", async () => {
    await runBtSync(ctx.dbi, makeFixtureBtClient(FIXTURE));

    // Tamara edits the design fields locally.
    await ctx.dbi.exec(
      `UPDATE tile_entries SET brand = 'Emser', style = 'Winter Storm', color = 'Glacier'
       WHERE external_id = 'BT-sel-9101'`,
    );

    // BT changes the commercial columns on the next pull.
    const client = makeFixtureBtClient(FIXTURE);
    const snap = await client.fetchSnapshot();
    const edited: BtSnapshot = {
      jobs: snap.jobs,
      selections: snap.selections.map((s) =>
        s.id === "BT-sel-9101"
          ? { ...s, allowance: 2500, status: "approved", fields: { ...s.fields, brand: "SomethingElse" } }
          : s,
      ),
    };
    await runBtSync(ctx.dbi, staticClient(edited));

    const row = await ctx.dbi.query<{
      brand: string;
      style: string;
      color: string;
      allowance: number;
      status: string;
    }>(
      `SELECT brand, style, color, allowance, status FROM tile_entries WHERE external_id = 'BT-sel-9101'`,
    );
    expect(row).toHaveLength(1);
    // Design fields: hers. Commercial fields: BT's.
    expect(row[0]!.brand).toBe("Emser");
    expect(row[0]!.style).toBe("Winter Storm");
    expect(row[0]!.color).toBe("Glacier");
    expect(Number(row[0]!.allowance)).toBe(2500);
    expect(row[0]!.status).toBe("approved");
  });

  it("is idempotent — second run updates, creates nothing, no duplicates", async () => {
    await runBtSync(ctx.dbi, makeFixtureBtClient(FIXTURE));
    const report = await runBtSync(ctx.dbi, makeFixtureBtClient(FIXTURE));

    expect(report.projects.created).toBe(0);
    expect(report.entries.created).toBe(0);
    expect(report.entries.updated).toBeGreaterThan(0);

    const dupes = await ctx.dbi.query(
      `SELECT external_id, COUNT(*) AS n FROM tile_entries
       WHERE external_id IS NOT NULL GROUP BY external_id HAVING COUNT(*) > 1`,
    );
    expect(dupes).toHaveLength(0);
  });

  it("skips allowance-only and unmapped selections, reporting the unmapped category", async () => {
    const report = await runBtSync(ctx.dbi, makeFixtureBtClient(FIXTURE));
    // BT-sel-9103 (cabinet allowance, no product fields) + BT-sel-9104
    // (Low Voltage, unmapped category).
    expect(report.entries.skipped).toBe(2);
    expect(report.unmapped).toEqual([
      { selection_id: "BT-sel-9104", category: "Low Voltage" },
    ]);
    const cabinets = await ctx.dbi.query(`SELECT id FROM cabinet_entries`);
    expect(cabinets).toHaveLength(0);
  });

  it("records sync_runs — ok with summary, error with message", async () => {
    await runBtSync(ctx.dbi, makeFixtureBtClient(FIXTURE));
    const ok = await ctx.dbi.query<{ status: string; summary: string }>(
      `SELECT status, summary FROM sync_runs ORDER BY started_at DESC LIMIT 1`,
    );
    expect(ok[0]!.status).toBe("ok");
    expect(JSON.parse(ok[0]!.summary).source).toBe("buildertrend");

    const failing: BtClient = {
      fetchSnapshot: async () => {
        throw new Error("BT unreachable");
      },
    };
    await expect(runBtSync(ctx.dbi, failing)).rejects.toThrow("BT unreachable");
    const err = await ctx.dbi.query<{ status: string; error: string }>(
      `SELECT status, error FROM sync_runs WHERE status = 'error'`,
    );
    expect(err).toHaveLength(1);
    expect(err[0]!.error).toContain("BT unreachable");
  });
});
