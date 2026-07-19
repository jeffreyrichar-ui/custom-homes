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

  describe("/complete cross-field inference", () => {
    it("infers brand from style", async () => {
      const res = await supertest(ctx.app)
        .post("/api/suggest/complete")
        .send({
          trade: "tile",
          partial: { brand: "", style: "Marble Attache", color: "", sku: "" },
        });
      expect(res.status).toBe(200);
      expect(res.body.candidate_count).toBeGreaterThan(0);
      expect(res.body.suggestions.brand?.value).toBe("Daltile");
      expect(res.body.suggestions.brand?.confidence).toBeGreaterThanOrEqual(0.5);
      // The style field was provided, so no suggestion is returned for it.
      expect(res.body.suggestions.style).toBeUndefined();
    });

    it("infers color from brand+style", async () => {
      const res = await supertest(ctx.app)
        .post("/api/suggest/complete")
        .send({
          trade: "tile",
          partial: { brand: "Daltile", style: "Marble Attache" },
        });
      expect(res.status).toBe(200);
      expect(res.body.candidate_count).toBeGreaterThan(0);
      expect(res.body.suggestions.color?.value).toBe("Lavish White");
      expect(res.body.suggestions.color?.confidence).toBeGreaterThanOrEqual(0.5);
      expect(res.body.suggestions.sku?.value).toBe("MA85");
    });

    it("infers style+color from SKU", async () => {
      const res = await supertest(ctx.app)
        .post("/api/suggest/complete")
        .send({
          trade: "tile",
          partial: { sku: "MA85" },
        });
      expect(res.status).toBe(200);
      expect(res.body.candidate_count).toBeGreaterThan(0);
      expect(res.body.suggestions.brand?.value).toBe("Daltile");
      expect(res.body.suggestions.style?.value).toBe("Marble Attache");
      expect(res.body.suggestions.color?.value).toBe("Lavish White");
    });

    it("returns null suggestions when no historical match", async () => {
      const res = await supertest(ctx.app)
        .post("/api/suggest/complete")
        .send({
          trade: "tile",
          partial: { style: "NeverSeenBefore-XYZ-9999" },
        });
      expect(res.status).toBe(200);
      expect(res.body.candidate_count).toBe(0);
      // Every empty completable field should still appear with value=null.
      expect(res.body.suggestions.brand).toEqual({ value: null, confidence: 0 });
      expect(res.body.suggestions.color).toEqual({ value: null, confidence: 0 });
      expect(res.body.suggestions.sku).toEqual({ value: null, confidence: 0 });
    });

    it("handles empty partial gracefully", async () => {
      const res = await supertest(ctx.app)
        .post("/api/suggest/complete")
        .send({ trade: "tile", partial: {} });
      expect(res.status).toBe(200);
      expect(res.body.candidate_count).toBe(0);
      // tile has brand/style/color/sku/pattern/edge_profile columns.
      expect(res.body.suggestions.brand).toEqual({ value: null, confidence: 0 });
      expect(res.body.suggestions.pattern).toEqual({ value: null, confidence: 0 });
      expect(res.body.suggestions.edge_profile).toEqual({ value: null, confidence: 0 });
    });

    it("400s when trade is missing", async () => {
      const res = await supertest(ctx.app)
        .post("/api/suggest/complete")
        .send({ partial: { brand: "Daltile" } });
      expect(res.status).toBe(400);
    });

    it("paint trade — infers brand from color_name", async () => {
      const res = await supertest(ctx.app)
        .post("/api/suggest/complete")
        .send({ trade: "paint", partial: { color: "Alabaster" } });
      expect(res.status).toBe(200);
      // Paint table uses color_name; the server maps logical "color" to it.
      expect(res.body.candidate_count).toBeGreaterThan(0);
      expect(res.body.suggestions.brand?.value).toBe("Sherwin-Williams");
      // Pattern/edge_profile don't exist on paint — they should not appear.
      expect(res.body.suggestions.pattern).toBeUndefined();
      expect(res.body.suggestions.edge_profile).toBeUndefined();
    });
  });
});
