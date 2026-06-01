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
import { adminAuth } from "../src/middleware/adminAuth.js";
import { healthRouter } from "../src/routes/health.js";
import { makeProjectsRouter } from "../src/routes/projects.js";
import { makeAdminImportRouter } from "../src/routes/adminImport.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(__dirname, "../src/db/migrations/sqlite");

process.env.ADMIN_TOKEN = "test-token";
process.env.DATABASE_URL = "file::memory:";

function buildTestApp() {
  const client = new Database(":memory:");
  client.pragma("foreign_keys = ON");
  const d = drizzle(client, { schema: sqliteSchema });
  migrate(d, { migrationsFolder: MIGRATIONS });
  const db: AppDb = { kind: "sqlite", client, drizzle: d, schema: sqliteSchema };
  const dbi = makeDbi(db);

  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api/health", healthRouter);
  app.use("/api/projects", makeProjectsRouter(() => dbi));
  app.use("/api/admin", adminAuth, makeAdminImportRouter(() => dbi));
  return { app, client };
}

describe("routes", () => {
  let ctx: ReturnType<typeof buildTestApp>;
  beforeEach(() => {
    ctx = buildTestApp();
  });
  afterEach(() => {
    ctx.client.close();
  });

  it("GET /api/health responds 200", async () => {
    const res = await supertest(ctx.app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("POST /api/admin/import without token returns 401", async () => {
    const res = await supertest(ctx.app)
      .post("/api/admin/import")
      .send(exampleProject);
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/import with bad token returns 401", async () => {
    const res = await supertest(ctx.app)
      .post("/api/admin/import")
      .set("x-admin-token", "wrong")
      .send(exampleProject);
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/import with correct token imports the project", async () => {
    const res = await supertest(ctx.app)
      .post("/api/admin/import")
      .set("x-admin-token", "test-token")
      .send(exampleProject);
    expect(res.status).toBe(200);
    expect(res.body.project_id).toBeTruthy();
    expect(res.body.errors).toEqual([]);
  });

  it("GET /api/projects returns the imported project", async () => {
    await supertest(ctx.app)
      .post("/api/admin/import")
      .set("x-admin-token", "test-token")
      .send(exampleProject);

    const list = await supertest(ctx.app).get("/api/projects");
    expect(list.status).toBe(200);
    expect(list.body.projects).toHaveLength(1);
    expect(list.body.projects[0].room_count).toBe(2);
    expect(list.body.projects[0].entry_count).toBeGreaterThan(0);
    expect(list.body.projects[0].top_brand).toBeTruthy();

    const id = list.body.projects[0].id;
    const detail = await supertest(ctx.app).get(`/api/projects/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.rooms).toHaveLength(2);
    expect(detail.body.rooms[0].entries_by_trade.tile.length).toBeGreaterThan(0);
  });

  it("GET /api/projects/:id 404s for unknown id", async () => {
    const res = await supertest(ctx.app).get("/api/projects/missing");
    expect(res.status).toBe(404);
  });

  it("dry-run does not persist", async () => {
    const dryRun = await supertest(ctx.app)
      .post("/api/admin/import/dry-run")
      .set("x-admin-token", "test-token")
      .send(exampleProject);
    expect(dryRun.status).toBe(200);

    const list = await supertest(ctx.app).get("/api/projects");
    expect(list.body.projects).toHaveLength(0);
  });
});
