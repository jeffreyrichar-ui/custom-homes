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

  describe("project management", () => {
    it("PATCH renames a project and updates the address", async () => {
      const p = await supertest(ctx.app)
        .post("/api/selections/projects")
        .send({ name: "Old Name", address: "1 Old St" });
      const res = await supertest(ctx.app)
        .patch(`/api/selections/projects/${p.body.id}`)
        .send({ name: "New Name", address: "2 New Ave" });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(p.body.id);
      expect(res.body.name).toBe("New Name");
      expect(res.body.address).toBe("2 New Ave");
      const rows = await ctx.dbi.query<{ name: string; address: string | null }>(
        "SELECT name, address FROM projects WHERE id = $1",
        [p.body.id],
      );
      expect(rows[0]?.name).toBe("New Name");
      expect(rows[0]?.address).toBe("2 New Ave");
    });

    it("PATCH 404s on missing project", async () => {
      const res = await supertest(ctx.app)
        .patch("/api/selections/projects/does-not-exist")
        .send({ name: "Whatever" });
      expect(res.status).toBe(404);
    });

    it("PATCH rejects empty name", async () => {
      const p = await supertest(ctx.app)
        .post("/api/selections/projects")
        .send({ name: "Has A Name" });
      const res = await supertest(ctx.app)
        .patch(`/api/selections/projects/${p.body.id}`)
        .send({ name: "   " });
      expect(res.status).toBe(400);
    });

    it("DELETE removes project and cascades to rooms", async () => {
      const p = await supertest(ctx.app).post("/api/selections/projects").send({ name: "Doomed" });
      await supertest(ctx.app)
        .post(`/api/selections/projects/${p.body.id}/rooms`)
        .send({ room_name: "Kitchen" });
      await supertest(ctx.app)
        .post(`/api/selections/projects/${p.body.id}/rooms`)
        .send({ room_name: "Bath" });
      const del = await supertest(ctx.app).delete(
        `/api/selections/projects/${p.body.id}`,
      );
      expect(del.status).toBe(204);
      const projects = await ctx.dbi.query(
        "SELECT id FROM projects WHERE id = $1",
        [p.body.id],
      );
      expect(projects).toHaveLength(0);
      const rooms = await ctx.dbi.query(
        "SELECT id FROM rooms WHERE project_id = $1",
        [p.body.id],
      );
      expect(rooms).toHaveLength(0);
    });

    it("DELETE 404s on missing project", async () => {
      const res = await supertest(ctx.app).delete(
        "/api/selections/projects/missing-project",
      );
      expect(res.status).toBe(404);
    });

    it("POST duplicate clones rooms and tile entries", async () => {
      const p = await supertest(ctx.app)
        .post("/api/selections/projects")
        .send({ name: "Source", address: "10 Source Rd" });
      const room = await supertest(ctx.app)
        .post(`/api/selections/projects/${p.body.id}/rooms`)
        .send({ room_name: "Master Bath" });
      await supertest(ctx.app)
        .post(`/api/selections/rooms/${room.body.id}/entries`)
        .send({
          trade: "tile",
          brand: "Daltile",
          style: "Miramo",
          color: "Pearl",
          sku: "DM-PEARL",
          grout_color: "Light Gray",
          location_in_room: "shower_walls",
          notes: "matte finish",
          allowance: 12.5,
          status: "selected",
        });

      const dup = await supertest(ctx.app)
        .post(`/api/selections/projects/${p.body.id}/duplicate`)
        .send({ name: "Clone" });
      expect(dup.status).toBe(201);
      expect(dup.body.id).toBeTruthy();
      expect(dup.body.id).not.toBe(p.body.id);
      expect(dup.body.name).toBe("Clone");

      const newProject = await ctx.dbi.query<{
        id: string;
        name: string;
        address: string | null;
      }>("SELECT id, name, address FROM projects WHERE id = $1", [dup.body.id]);
      expect(newProject[0]?.name).toBe("Clone");
      expect(newProject[0]?.address).toBeNull();

      const newRooms = await ctx.dbi.query<{ id: string; room_name: string }>(
        "SELECT id, room_name FROM rooms WHERE project_id = $1 ORDER BY room_name",
        [dup.body.id],
      );
      expect(newRooms).toHaveLength(1);
      expect(newRooms[0]?.room_name).toBe("Master Bath");
      expect(newRooms[0]?.id).not.toBe(room.body.id);

      const newTile = await ctx.dbi.query<{
        id: string;
        room_id: string;
        brand: string;
        style: string | null;
        color: string | null;
        sku: string | null;
        grout_color: string | null;
        location_in_room: string;
        notes: string | null;
        allowance: number | null;
        status: string;
      }>(
        "SELECT id, room_id, brand, style, color, sku, grout_color, location_in_room, notes, allowance, status FROM tile_entries WHERE room_id = $1",
        [newRooms[0]!.id],
      );
      expect(newTile).toHaveLength(1);
      const cloned = newTile[0]!;
      expect(cloned.room_id).toBe(newRooms[0]!.id);
      expect(cloned.brand).toBe("Daltile");
      expect(cloned.style).toBe("Miramo");
      expect(cloned.color).toBe("Pearl");
      expect(cloned.sku).toBe("DM-PEARL");
      expect(cloned.grout_color).toBe("Light Gray");
      expect(cloned.location_in_room).toBe("shower_walls");
      expect(cloned.notes).toBe("matte finish");
      expect(cloned.allowance).toBe(12.5);
      expect(cloned.status).toBe("selected");

      // Source project must remain intact.
      const sourceRoomsAfter = await ctx.dbi.query(
        "SELECT id FROM rooms WHERE project_id = $1",
        [p.body.id],
      );
      expect(sourceRoomsAfter).toHaveLength(1);
    });

    it("POST duplicate requires a name", async () => {
      const p = await supertest(ctx.app)
        .post("/api/selections/projects")
        .send({ name: "Source" });
      const noBody = await supertest(ctx.app)
        .post(`/api/selections/projects/${p.body.id}/duplicate`)
        .send({});
      expect(noBody.status).toBe(400);
      const empty = await supertest(ctx.app)
        .post(`/api/selections/projects/${p.body.id}/duplicate`)
        .send({ name: "   " });
      expect(empty.status).toBe(400);
    });
  });
});
