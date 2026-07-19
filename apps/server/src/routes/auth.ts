import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Dbi } from "../db/dbi.js";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  findUserByEmail,
  hashPassword,
  signSessionToken,
  verifyPassword,
} from "../services/auth.js";

export function makeAuthRouter(getDbi: () => Dbi): Router {
  const router = Router();

  router.post("/login", async (req, res, next) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!email || !password) {
        res.status(400).json({ error: "email and password required" });
        return;
      }
      const user = await findUserByEmail(getDbi(), email);
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        res.status(401).json({ error: "Email or password doesn\u2019t match \u2014 please try again" });
        return;
      }
      const token = signSessionToken(user.id);
      res.cookie(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
      res.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        token,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.json({ ok: true });
  });

  router.get("/me", (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "not authenticated" });
      return;
    }
    res.json({ user: req.user });
  });

  // Bootstrap helper — creates the first user if no users exist yet.
  // Once users exist, returns 403.
  router.post("/bootstrap", async (req, res, next) => {
    try {
      const dbi = getDbi();
      const existing = await dbi.query<{ n: number | string }>(
        `SELECT COUNT(*) AS n FROM users`,
      );
      if (existing[0] && Number(existing[0].n) > 0) {
        res.status(403).json({ error: "bootstrap closed — users already exist" });
        return;
      }
      const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : null;
      if (!email || !password || password.length < 8) {
        res.status(400).json({ error: "email and password (min 8 chars) required" });
        return;
      }
      const hash = await hashPassword(password);
      const id = randomUUID();
      await dbi.exec(
        `INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)`,
        [id, email, hash, name, "owner"],
      );
      const token = signSessionToken(id);
      res.cookie(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
      res.status(201).json({ user: { id, email, name, role: "owner" }, token });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
