import type { RequestHandler } from "express";
import { env } from "../env.js";

export const adminAuth: RequestHandler = (req, res, next) => {
  const token = req.header("x-admin-token");
  if (!token || token !== env.ADMIN_TOKEN) {
    res.status(401).json({ error: "missing or invalid x-admin-token" });
    return;
  }
  next();
};
