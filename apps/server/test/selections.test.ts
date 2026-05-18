import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import supertest from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "../src/db/client.js";
import { makeDbi } from "../src/db/dbi.js";
import * as sqliteSchema from "../src/db/schema.sqlite.js";
import { makeSelectionsRouter } from "../src/routes/selections.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(__dirname, "../src/db/migrations/sqlite");

function buildApp() {
  const client = new Database(":memory:");
  client.pragma("foreign_keys = ON");
  const d = drizzle(client, { schema: sqliteSchema });
  migrate(d, { migrationsFolder: MIGRATIONS });
  const db: AppDb = { kind: "sqlite", client, drizzle: d, schema: sqliteSchema };
  const dbi = makeDbi(db);
  const app = express();
  app.use(express.json());
  app.use("/api/selections", makeSelectionsRouter(() => dbi));
  return { app, client, dbi };
}

describe("/api/selections", () => {
  let ctx: ReturnType<typeof buildApp>;
  beforeEach(() => {
    ctx = buildApp();
  });
  afterEach(() => {
    ctx.client.close();
  });

  it("creates a project", async () => {
    const res = await supertest(ctx.app)
      .post("/api/selections/projects")
      .send({ name: "Test House", address: "1 Test Way" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.name).toBe("Test House");
  });

  it("rejects empty project name", async () => {
    const res = await supertest(ctx.app)
      .post("/api/selections/projects")
      .send({ name: "" });
    expect(res.status).toBe(400);
  });

  it("adds a room to a project", async () => {
    const p = await supertest(ctx.app)
      .post("/api/selections/projects")
      .send({ name: "P1" });
    const res = await supertest(ctx.app)
      .post(`/api/selections/projects/${p.body.id}/rooms`)
      .send({ room_name: "Master Bath" });
    expect(res.status).toBe(201);
    expect(res.body.room_name).toBe("Master Bath");
  });

  it("re-adding the same room is idempotent (200, same id)", async () => {
    const p = await supertest(ctx.app).post("/api/selections/projects").send({ name: "P1" });
    const r1 = await supertest(ctx.app)
      .post(`/api/selections/projects/${p.body.id}/rooms`)
      .send({ room_name: "Master Bath" });
    const r2 = await supertest(ctx.app)
      .post(`/api/selections/projects/${p.body.id}/rooms`)
      .send({ room_name: "Master Bath" });
    expect(r2.status).toBe(200);
    expect(r2.body.id).toBe(r1.body.id);
  });

  it("saves a tile entry and tags novel-combination", async () => {
    const p = await supertest(ctx.app).post("/api/selections/projects").send({ name: "P1" });
    const r = await supertest(ctx.app)
      .post(`/api/selections/projects/${p.body.id}/rooms`)
      .send({ room_name: "Master Bath" });
    const e = await supertest(ctx.app)
      .post(`/api/selections/rooms/${r.body.id}/entries`)
      .send({
        trade: "tile",
        brand: "Daltile",
        style: "Miramo",
        color: "Pearl",
        location_in_room: "shower_walls",
      });
    expect(e.status).toBe(201);
    expect(e.body.is_new_entry).toBe(true);
  });

  it("rejects an entry with missing required field", async () => {
    const p = await supertest(ctx.app).post("/api/selections/projects").send({ name: "P1" });
    const r = await supertest(ctx.app)
      .post(`/api/selections/projects/${p.body.id}/rooms`)
      .send({ room_name: "Master Bath" });
    const e = await supertest(ctx.app)
      .post(`/api/selections/rooms/${r.body.id}/entries`)
      .send({ trade: "tile", style: "Miramo" }); // no brand, no location
    expect(e.status).toBe(400);
  });

  it("updates an existing entry via PUT", async () => {
    const p = await supertest(ctx.app).post("/api/selections/projects").send({ name: "P1" });
    const r = await supertest(ctx.app)
      .post(`/api/selections/projects/${p.body.id}/rooms`)
      .send({ room_name: "Master Bath" });
    const e = await supertest(ctx.app)
      .post(`/api/selections/rooms/${r.body.id}/entries`)
      .send({
        trade: "tile",
        brand: "Daltile",
        style: "Miramo",
        color: "Pearl",
        location_in_room: "shower_walls",
      });
    const upd = await supertest(ctx.app)
      .put(`/api/selections/entries/tile/${e.body.id}`)
      .send({
        trade: "tile",
        brand: "Daltile",
        style: "Miramo",
        color: "Oyster",
        location_in_room: "shower_walls",
      });
    expect(upd.status).toBe(200);
    const rows = await ctx.dbi.query<{ color: string }>(
      "SELECT color FROM tile_entries WHERE id = $1",
      [e.body.id],
    );
    expect(rows[0]?.color).toBe("Oyster");
  });

  it("deletes an entry", async () => {
    const p = await supertest(ctx.app).post("/api/selections/projects").send({ name: "P1" });
    const r = await supertest(ctx.app)
      .post(`/api/selections/projects/${p.body.id}/rooms`)
      .send({ room_name: "Master Bath" });
    const e = await supertest(ctx.app)
      .post(`/api/selections/rooms/${r.body.id}/entries`)
      .send({
        trade: "tile",
        brand: "Daltile",
        style: "Miramo",
        color: "Pearl",
        location_in_room: "shower_walls",
      });
    const del = await supertest(ctx.app).delete(`/api/selections/entries/tile/${e.body.id}`);
    expect(del.status).toBe(204);
    const rows = await ctx.dbi.query("SELECT id FROM tile_entries WHERE id = $1", [e.body.id]);
    expect(rows).toHaveLength(0);
  });
});
