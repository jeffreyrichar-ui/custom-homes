import { Router } from "express";
import { dialect } from "../env.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ ok: true, db: dialect });
});
