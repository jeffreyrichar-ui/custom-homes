import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import supertest from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exampleProject } from "@custom-homes/shared";
import type { AppDb } from "../src/db/client.js";
import { makeDbi, type Dbi } from "../src/db/dbi.js";
import * as sqliteSchema from "../src/db/schema.sqlite.js";
import { runImport } from "../src/services/importer.js";
import { makeStatsRouter } from "../src/routes/stats.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(__dirname, "../src/db/migrations/sqlite");

async function buildApp() {
  const client = new Database(":memory:");
  client.pragma("foreign_keys = ON");
  const d = drizzle(client, { schema: sqliteSchema });
  migrate(d, { migrationsFolder: MIGRATIONS });
  const db: AppDb = { kind: "sqlite", client, drizzle: d, schema: sqliteSchema };
  const dbi = makeDbi(db);
  await runImport(dbi, exampleProject, { dryRun: false });

  const app = express();
  app.use(express.json());
  app.use("/api/stats", makeStatsRouter(() => dbi));
  return { app, client };
}

async function buildEmptyApp() {
  const client = new Database(":memory:");
  client.pragma("foreign_keys = ON");
  const d = drizzle(client, { schema: sqliteSchema });
  migrate(d, { migrationsFolder: MIGRATIONS });
  const db: AppDb = { kind: "sqlite", client, drizzle: d, schema: sqliteSchema };
  const dbi = makeDbi(db);

  const app = express();
  app.use(express.json());
  app.use("/api/stats", makeStatsRouter(() => dbi));
  return { app, client, dbi };
}

describe("/api/stats", () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    ctx = await buildApp();
  });
  afterEach(() => {
    ctx.client.close();
  });

  it("returns the expected shape", async () => {
    const res = await supertest(ctx.app).get("/api/stats");
    expect(res.status).toBe(200);
    expect(typeof res.body.projects).toBe("number");
    expect(typeof res.body.rooms).toBe("number");
    expect(res.body.entries).toBeDefined();
    expect(typeof res.body.entries.tile).toBe("number");
    expect(typeof res.body.entries.paint).toBe("number");
    expect(typeof res.body.entries.carpet).toBe("number");
    expect(typeof res.body.entries.hardwood).toBe("number");
    expect(typeof res.body.entries.cabinet).toBe("number");
    expect(typeof res.body.entries.countertop).toBe("number");
    expect(typeof res.body.entries.total).toBe("number");
    expect(Array.isArray(res.body.top_brands)).toBe(true);
    expect(Array.isArray(res.body.top_vendors)).toBe(true);
    expect(typeof res.body.novel_entries).toBe("number");
  });

  it("counts are positive integers", async () => {
    const res = await supertest(ctx.app).get("/api/stats");
    expect(res.status).toBe(200);
    // After seeding the example project there must be projects/rooms/entries
    expect(res.body.projects).toBeGreaterThan(0);
    expect(Number.isInteger(res.body.projects)).toBe(true);
    expect(res.body.rooms).toBeGreaterThan(0);
    expect(Number.isInteger(res.body.rooms)).toBe(true);
    expect(res.body.entries.total).toBeGreaterThan(0);
    expect(Number.isInteger(res.body.entries.total)).toBe(true);
    // Per-trade entry counts are non-negative integers and sum to total
    let sum = 0;
    for (const trade of ["tile", "paint", "carpet", "hardwood", "cabinet", "countertop"] as const) {
      const n = res.body.entries[trade];
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      sum += n;
    }
    expect(sum).toBe(res.body.entries.total);
    // novel_entries is a non-negative integer
    expect(Number.isInteger(res.body.novel_entries)).toBe(true);
    expect(res.body.novel_entries).toBeGreaterThanOrEqual(0);
  });

  it("top_brands is an array sorted by count desc", async () => {
    const res = await supertest(ctx.app).get("/api/stats");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.top_brands)).toBe(true);
    expect(res.body.top_brands.length).toBeGreaterThan(0);
    expect(res.body.top_brands.length).toBeLessThanOrEqual(5);
    for (const b of res.body.top_brands) {
      expect(typeof b.brand).toBe("string");
      expect(typeof b.count).toBe("number");
      expect(b.count).toBeGreaterThan(0);
    }
    const counts = res.body.top_brands.map((b: { count: number }) => b.count);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]!);
    }
  });

  it("recent_activity has expected shape", async () => {
    const res = await supertest(ctx.app).get("/api/stats");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recent_activity)).toBe(true);
    expect(res.body.recent_activity.length).toBeLessThanOrEqual(10);
    for (const item of res.body.recent_activity) {
      expect(typeof item.when).toBe("string");
      expect(["project", "room", "entry"]).toContain(item.kind);
      expect(typeof item.label).toBe("string");
      expect(typeof item.project_id).toBe("string");
      expect(typeof item.project_name).toBe("string");
    }
  });

  it("recent_activity timestamps are ISO with a zone, not raw SQLite strings", async () => {
    const res = await supertest(ctx.app).get("/api/stats");
    expect(res.status).toBe(200);
    // Seeded rows get SQLite CURRENT_TIMESTAMP ("YYYY-MM-DD HH:MM:SS", UTC,
    // no zone marker) — the route must normalize to ISO so new Date(when)
    // can't misread the value as local time.
    expect(res.body.recent_activity.length).toBeGreaterThan(0);
    for (const item of res.body.recent_activity as Array<{ when: string }>) {
      const parsed = new Date(item.when);
      expect(Number.isFinite(parsed.getTime())).toBe(true);
      expect(item.when).toContain("T");
      expect(item.when).toMatch(/(Z|[+-]\d{2}:\d{2})$/);
      expect(parsed.toISOString()).toContain("T");
    }
  });
});

describe("/api/stats — recent_activity ordering", () => {
  let client: Database.Database;
  let dbi: Dbi;
  let app: express.Express;

  beforeEach(async () => {
    const built = await buildEmptyApp();
    client = built.client;
    dbi = built.dbi;
    app = built.app;
  });
  afterEach(() => {
    client.close();
  });

  it("orders 1 project + 1 room + 2 tile entries newest first with correct labels", async () => {
    // Insert with explicit, strictly increasing created_at so ordering is
    // deterministic — CURRENT_TIMESTAMP only has second resolution in SQLite.
    const projectId = randomUUID();
    const roomId = randomUUID();
    const tile1Id = randomUUID();
    const tile2Id = randomUUID();

    await dbi.exec(
      `INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)`,
      [projectId, "Sunset Ridge", "2026-05-01T10:00:00.000Z"],
    );
    await dbi.exec(
      `INSERT INTO rooms (id, project_id, room_name, created_at) VALUES (?, ?, ?, ?)`,
      [roomId, projectId, "Master Bath", "2026-05-01T11:00:00.000Z"],
    );
    await dbi.exec(
      `INSERT INTO tile_entries
         (id, room_id, brand, style, color, location_in_room, status, is_new_entry, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'selected', 0, ?)`,
      [
        tile1Id,
        roomId,
        "Daltile",
        "Rittenhouse",
        "White",
        "shower walls",
        "2026-05-01T12:00:00.000Z",
      ],
    );
    await dbi.exec(
      `INSERT INTO tile_entries
         (id, room_id, brand, style, color, location_in_room, status, is_new_entry, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'selected', 0, ?)`,
      [
        tile2Id,
        roomId,
        "Bedrosians",
        "Cloe",
        "Blue",
        "shower floor",
        "2026-05-01T13:00:00.000Z",
      ],
    );

    const res = await supertest(app).get("/api/stats");
    expect(res.status).toBe(200);
    const activity = res.body.recent_activity as Array<{
      when: string;
      kind: "project" | "room" | "entry";
      label: string;
      project_id: string;
      project_name: string;
    }>;
    expect(activity).toHaveLength(4);

    // Newest first: tile2, tile1, room, project.
    expect(activity[0]!.kind).toBe("entry");
    expect(activity[0]!.label).toBe(
      "tile entry: Bedrosians Cloe (Master Bath)",
    );
    expect(activity[0]!.project_id).toBe(projectId);
    expect(activity[0]!.project_name).toBe("Sunset Ridge");

    expect(activity[1]!.kind).toBe("entry");
    expect(activity[1]!.label).toBe(
      "tile entry: Daltile Rittenhouse (Master Bath)",
    );

    expect(activity[2]!.kind).toBe("room");
    expect(activity[2]!.label).toBe("Added Master Bath to Sunset Ridge");

    expect(activity[3]!.kind).toBe("project");
    expect(activity[3]!.label).toBe("New project: Sunset Ridge");

    // when values are strictly non-increasing.
    for (let i = 1; i < activity.length; i++) {
      expect(activity[i - 1]!.when >= activity[i]!.when).toBe(true);
    }
  });
});
