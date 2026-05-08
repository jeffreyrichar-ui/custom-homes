import { Router } from "express";
import type { Dbi } from "../db/dbi.js";
import { adminAuth } from "../middleware/adminAuth.js";
import { runImport } from "../services/importer.js";

export function makeAdminImportRouter(getDbi: () => Dbi): Router {
  const router = Router();
  router.use(adminAuth);

  router.post("/import", async (req, res, next) => {
    try {
      const result = await runImport(getDbi(), req.body, { dryRun: false });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/import/dry-run", async (req, res, next) => {
    try {
      const result = await runImport(getDbi(), req.body, { dryRun: true });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
