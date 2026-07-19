import { Router } from "express";
import type { Dbi } from "../db/dbi.js";
import { runImport } from "../services/importer.js";
import type { ImportResult } from "@custom-homes/shared";

/**
 * Per the import contract: 400 when the top-level payload shape fails to
 * parse (nothing was processed), 200 otherwise — including partial success
 * with per-entry errors.
 */
function statusFor(result: ImportResult): number {
  const p = result.summary.projects;
  const topLevelFailure =
    result.project_id === null &&
    p.created === 0 &&
    p.updated === 0 &&
    p.failed === 0 &&
    result.errors.length > 0;
  return topLevelFailure ? 400 : 200;
}

export function makeAdminImportRouter(getDbi: () => Dbi): Router {
  const router = Router();

  router.post("/import", async (req, res, next) => {
    try {
      const result = await runImport(getDbi(), req.body, { dryRun: false });
      res.status(statusFor(result)).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/import/dry-run", async (req, res, next) => {
    try {
      const result = await runImport(getDbi(), req.body, { dryRun: true });
      res.status(statusFor(result)).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
