import Database from "better-sqlite3";
import cookieParser from "cookie-parser";
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
import { makeAuthMiddleware } from "../src/middleware/auth.js";
import { makeAuthRouter } from "../src/routes/auth.js";

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
  app.use(cookieParser());
  const auth = makeAuthMiddleware(() => dbi);
  app.use("/api/auth", makeAuthRouter(() => dbi));
  app.get("/api/auth/check", auth, (req, res) => {
    res.json({ user: req.user });
  });
  app.get("/api/protected", auth, (req, res) => {
    res.json({ ok: true, user: req.user });
  });
  return { app, client };
}

describe("/api/auth", () => {
  let ctx: ReturnType<typeof buildApp>;
  beforeEach(() => {
    ctx = buildApp();
  });
  afterEach(() => {
    ctx.client.close();
  });

  it("bootstrap creates the first user", async () => {
    const res = await supertest(ctx.app)
      .post("/api/auth/bootstrap")
      .send({ email: "tamara@example.com", password: "supersecret", name: "Tamara" });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("tamara@example.com");
    expect(res.body.user.role).toBe("owner");
    expect(res.body.token).toBeTruthy();
  });

  it("bootstrap closes once a user exists", async () => {
    await supertest(ctx.app)
      .post("/api/auth/bootstrap")
      .send({ email: "a@b.c", password: "supersecret" });
    const res = await supertest(ctx.app)
      .post("/api/auth/bootstrap")
      .send({ email: "x@y.z", password: "supersecret" });
    expect(res.status).toBe(403);
  });

  it("login with correct password returns a token", async () => {
    await supertest(ctx.app)
      .post("/api/auth/bootstrap")
      .send({ email: "tamara@example.com", password: "supersecret" });
    const res = await supertest(ctx.app)
      .post("/api/auth/login")
      .send({ email: "tamara@example.com", password: "supersecret" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("login with wrong password is 401", async () => {
    await supertest(ctx.app)
      .post("/api/auth/bootstrap")
      .send({ email: "tamara@example.com", password: "supersecret" });
    const res = await supertest(ctx.app)
      .post("/api/auth/login")
      .send({ email: "tamara@example.com", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("protected route requires a Bearer token", async () => {
    const res = await supertest(ctx.app).get("/api/protected");
    expect(res.status).toBe(401);
  });

  it("protected route succeeds with Bearer token", async () => {
    const r = await supertest(ctx.app)
      .post("/api/auth/bootstrap")
      .send({ email: "tamara@example.com", password: "supersecret" });
    const res = await supertest(ctx.app)
      .get("/api/protected")
      .set("authorization", `Bearer ${r.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("tamara@example.com");
  });
});
