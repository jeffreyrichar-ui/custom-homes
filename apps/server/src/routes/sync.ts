import { Router } from "express";
import type { Dbi } from "../db/dbi.js";
import { env } from "../env.js";
import {
  makeFixtureBtClient,
  makeHttpBtClient,
  type BtClient,
} from "../services/buildertrend/client.js";
import { runBtSync } from "../services/buildertrend/sync.js";

function resolveClient(): BtClient {
  if (env.BT_SYNC_SOURCE === "http") {
    if (!env.BT_API_BASE_URL || !env.BT_API_KEY) {
      throw new Error(
        "BT_SYNC_SOURCE=http requires BT_API_BASE_URL and BT_API_KEY",
      );
    }
    return makeHttpBtClient({ baseUrl: env.BT_API_BASE_URL, apiKey: env.BT_API_KEY });
  }
  return makeFixtureBtClient();
}

export function makeSyncRouter(getDbi: () => Dbi): Router {
  const router = Router();

  router.post("/buildertrend", async (_req, res, next) => {
    try {
      const report = await runBtSync(getDbi(), resolveClient());
      res.status(200).json(report);
    } catch (err) {
      next(err);
    }
  });

  router.get("/runs", async (_req, res, next) => {
    try {
      const rows = await getDbi().query(
        `SELECT id, source, status, summary, error, started_at, finished_at
         FROM sync_runs ORDER BY started_at DESC LIMIT 10`,
      );
      res.json({ runs: rows });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
