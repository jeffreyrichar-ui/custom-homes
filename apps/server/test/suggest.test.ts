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
import { makeSuggestRouter } from "../src/routes/suggest.js";

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
  app.use("/api/suggest", makeSuggestRouter(() => dbi));
  return { app, client };
}

describe("/api/suggest", () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    ctx = await buildApp();
  });
  afterEach(() => {
    ctx.client.close();
  });

  it("brands returns distinct brands ordered by count", async () => {
    const res = await supertest(ctx.app).get("/api/suggest/brands?trade=tile");
    expect(res.status).toBe(200);
    expect(res.body.brands).toBeInstanceOf(Array);
    expect(res.body.brands.length).toBeGreaterThan(0);
    const counts = res.body.brands.map((b: { count: number }) => b.count);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]!);
    }
  });

  it("styles requires brand", async () => {
    const res = await supertest(ctx.app).get("/api/suggest/styles?trade=tile");
    expect(res.status).toBe(400);
  });

  it("styles narrows by brand", async () => {
    const res = await supertest(ctx.app).get(
      "/api/suggest/styles?trade=tile&brand=Daltile",
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.styles)).toBe(true);
  });

  it("vendors returns distinct vendors", async () => {
    const res = await supertest(ctx.app).get("/api/suggest/vendors");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.vendors)).toBe(true);
  });
});
