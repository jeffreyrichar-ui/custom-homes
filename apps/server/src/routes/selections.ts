import { randomUUID } from "node:crypto";
import { Router } from "express";
import {
  ENTRY_SCHEMA_BY_TRADE,
  ENTRY_TABLE_BY_TRADE,
  TRADE_KINDS,
  type TradeKind,
} from "@custom-homes/shared";
import type { Dbi } from "../db/dbi.js";
import { adminAuth } from "../middleware/adminAuth.js";
import { tradeMeta, isTradeKind } from "../lib/tradeRegistry.js";
import type { ScrapeQueue } from "../services/scrapeQueue.js";

async function detectNovel(
  dbi: Dbi,
  trade: TradeKind,
  entry: Record<string, unknown>,
): Promise<boolean> {
  const table = ENTRY_TABLE_BY_TRADE[trade];
  const colorCol = trade === "paint" ? "color_name" : "color";
  const styleCol = trade === "hardwood" ? "species" : trade === "countertop" ? "material" : "style";
  const brand = entry.brand;
  const sku = entry.sku;
  const color = entry[colorCol];
  const style = entry[styleCol];

  // Novel = the (brand, style, color) tuple has never been seen before.
  // SKU alone isn't enough — the same color often gets a fresh SKU.
  const rows = await dbi.query<{ id: string }>(
    `SELECT id FROM ${table}
     WHERE brand = $1
       AND COALESCE(${styleCol}, '') = COALESCE($2, '')
       AND COALESCE(${colorCol}, '') = COALESCE($3, '')
     LIMIT 1`,
    [brand ?? null, style ?? null, color ?? null],
  );
  return rows.length === 0;
}

export function makeSelectionsRouter(
  getDbi: () => Dbi,
  scrapeQueue?: ScrapeQueue,
): Router {
  const router = Router();
  router.use(adminAuth);

  // Create an empty project
  router.post("/projects", async (req, res, next) => {
    try {
      const dbi = getDbi();
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const address = typeof req.body?.address === "string" ? req.body.address.trim() : null;
      if (!name) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      const id = randomUUID();
      await dbi.exec(
        `INSERT INTO projects (id, name, address) VALUES ($1, $2, $3)`,
        [id, name, address || null],
      );
      res.status(201).json({ id, name, address });
    } catch (err) {
      next(err);
    }
  });

  // Add a room to a project
  router.post("/projects/:projectId/rooms", async (req, res, next) => {
    try {
      const dbi = getDbi();
      const room_name = typeof req.body?.room_name === "string" ? req.body.room_name.trim() : "";
      if (!room_name) {
        res.status(400).json({ error: "room_name is required" });
        return;
      }
      // Verify project exists
      const projects = await dbi.query<{ id: string }>(
        `SELECT id FROM projects WHERE id = $1`,
        [req.params.projectId],
      );
      if (projects.length === 0) {
        res.status(404).json({ error: "project not found" });
        return;
      }
      // Idempotent: same name in same project = update existing
      const existing = await dbi.query<{ id: string }>(
        `SELECT id FROM rooms WHERE project_id = $1 AND room_name = $2`,
        [req.params.projectId, room_name],
      );
      if (existing[0]) {
        res.status(200).json({ id: existing[0].id, room_name, project_id: req.params.projectId });
        return;
      }
      const id = randomUUID();
      await dbi.exec(
        `INSERT INTO rooms (id, project_id, room_name) VALUES ($1, $2, $3)`,
        [id, req.params.projectId, room_name],
      );
      res.status(201).json({ id, room_name, project_id: req.params.projectId });
    } catch (err) {
      next(err);
    }
  });

  // Save a single entry into a room. Detects novel combinations and tags is_new_entry.
  router.post("/rooms/:roomId/entries", async (req, res, next) => {
    try {
      const dbi = getDbi();
      const trade = req.body?.trade;
      if (!isTradeKind(trade)) {
        res.status(400).json({
          error: `trade must be one of ${TRADE_KINDS.join(", ")}`,
        });
        return;
      }
      const schema = ENTRY_SCHEMA_BY_TRADE[trade];
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "validation failed",
          issues: parsed.error.issues,
        });
        return;
      }
      const entry = parsed.data as Record<string, unknown>;

      // Verify room exists
      const rooms = await dbi.query<{ id: string }>(
        `SELECT id FROM rooms WHERE id = $1`,
        [req.params.roomId],
      );
      if (rooms.length === 0) {
        res.status(404).json({ error: "room not found" });
        return;
      }

      const isNovel = await detectNovel(dbi, trade, entry);
      const meta = tradeMeta(trade);
      const row = meta.rowColumns(entry as never);
      // Override is_new_entry with our detection (registry default is what client sent or false)
      row.is_new_entry = isNovel;

      const cols = Object.keys(row);
      const insertCols = ["id", "room_id", ...cols];
      const id = randomUUID();
      const insertVals = [id, req.params.roomId, ...Object.values(row)];
      const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");
      await dbi.exec(
        `INSERT INTO ${meta.table} (${insertCols.join(", ")}) VALUES (${placeholders})`,
        insertVals,
      );

      // Trigger background scrape if this entry has brand + sku
      const brand = typeof entry.brand === "string" ? entry.brand : "";
      const sku = typeof entry.sku === "string" ? entry.sku : "";
      if (brand && sku && scrapeQueue) {
        scrapeQueue.enqueue(brand, sku);
      }

      res.status(201).json({ id, trade, is_new_entry: isNovel });
    } catch (err) {
      next(err);
    }
  });

  // Update an existing entry (PATCH semantics — replace all editable fields)
  router.put("/entries/:trade/:entryId", async (req, res, next) => {
    try {
      const trade = req.params.trade;
      if (!isTradeKind(trade)) {
        res.status(400).json({ error: `unknown trade: ${trade}` });
        return;
      }
      const dbi = getDbi();
      const schema = ENTRY_SCHEMA_BY_TRADE[trade];
      const parsed = schema.safeParse({ ...req.body, trade });
      if (!parsed.success) {
        res.status(400).json({ error: "validation failed", issues: parsed.error.issues });
        return;
      }
      const entry = parsed.data as Record<string, unknown>;
      const isNovel = await detectNovel(dbi, trade, entry);
      const meta = tradeMeta(trade);
      const row = meta.rowColumns(entry as never);
      row.is_new_entry = isNovel;
      const cols = Object.keys(row);
      const setClauses = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
      await dbi.exec(
        `UPDATE ${meta.table} SET ${setClauses} WHERE id = $${cols.length + 1}`,
        [...Object.values(row), req.params.entryId],
      );
      res.json({ id: req.params.entryId, trade, is_new_entry: isNovel });
    } catch (err) {
      next(err);
    }
  });

  // Delete an entry
  router.delete("/entries/:trade/:entryId", async (req, res, next) => {
    try {
      const trade = req.params.trade;
      if (!isTradeKind(trade)) {
        res.status(400).json({ error: `unknown trade: ${trade}` });
        return;
      }
      const dbi = getDbi();
      const meta = tradeMeta(trade);
      await dbi.exec(`DELETE FROM ${meta.table} WHERE id = $1`, [req.params.entryId]);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
