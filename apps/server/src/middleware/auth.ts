import type { RequestHandler } from "express";
import type { Dbi } from "../db/dbi.js";
import { env } from "../env.js";
import {
  SESSION_COOKIE_NAME,
  loadUser,
  type SessionUser,
  verifySessionToken,
} from "../services/auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function makeAuthMiddleware(getDbi: () => Dbi): RequestHandler {
  return async (req, res, next) => {
    // Backwards-compatible bypass: legacy x-admin-token header still works.
    const legacy = req.header("x-admin-token");
    if (legacy && legacy === env.ADMIN_TOKEN) {
      req.user = { id: "admin-token", email: "admin@local", name: "Admin Token", role: "owner" };
      next();
      return;
    }

    const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies ?? {};
    const cookieToken = cookies[SESSION_COOKIE_NAME];
    const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const token = cookieToken ?? bearer;
    if (!token) {
      res.status(401).json({ error: "auth required" });
      return;
    }
    const verified = verifySessionToken(token);
    if (!verified) {
      res.status(401).json({ error: "invalid or expired session" });
      return;
    }
    const user = await loadUser(getDbi(), verified.userId);
    if (!user) {
      res.status(401).json({ error: "user no longer exists" });
      return;
    }
    req.user = user;
    next();
  };
}
