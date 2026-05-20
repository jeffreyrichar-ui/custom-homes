import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import supertest from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exampleProject } from "@custom-homes/shared";
import type { AppDb } from "../src/db/client.js";
import { makeDbi } from "../src/db/dbi.js";
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
});
