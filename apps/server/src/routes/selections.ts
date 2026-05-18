import crypto, { randomUUID } from "node:crypto";
import { Router } from "express";
import {
  ENTRY_SCHEMA_BY_TRADE,
  ENTRY_TABLE_BY_TRADE,
  TRADE_KINDS,
  type TradeKind,
} from "@custom-homes/shared";
import type { Dbi } from "../db/dbi.js";
import { tradeMeta, isTradeKind } from "../lib/tradeRegistry.js";
import type { ScrapeQueue } from "../services/scrapeQueue.js";

// Columns we never want to copy across when deep-cloning entry rows: the
// primary key, the foreign key to room (we're assigning a new one), and the
// timestamp (let the DB default re-stamp it for the new row).
const ENTRY_COPY_SKIP = new Set(["id", "room_id", "created_at"]);

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

  // Rename / update address on a project
  router.patch("/projects/:projectId", async (req, res, next) => {
    try {
      const dbi = getDbi();
      const body = (req.body ?? {}) as { name?: unknown; address?: unknown };
      const hasName = Object.prototype.hasOwnProperty.call(body, "name");
      const hasAddress = Object.prototype.hasOwnProperty.call(body, "address");

      let name: string | undefined;
      if (hasName) {
        const raw = typeof body.name === "string" ? body.name.trim() : "";
        if (!raw) {
          res.status(400).json({ error: "name must not be empty" });
          return;
        }
        name = raw;
      }

      let address: string | null | undefined;
      if (hasAddress) {
        if (body.address === null) {
          address = null;
        } else if (typeof body.address === "string") {
          const trimmed = body.address.trim();
          address = trimmed === "" ? null : trimmed;
        } else {
          res.status(400).json({ error: "address must be a string or null" });
          return;
        }
      }

      const existing = await dbi.query<{ id: string }>(
        `SELECT id FROM projects WHERE id = $1`,
        [req.params.projectId],
      );
      if (existing.length === 0) {
        res.status(404).json({ error: "project not found" });
        return;
      }

      const sets: string[] = [];
      const values: unknown[] = [];
      if (name !== undefined) {
        values.push(name);
        sets.push(`name = $${values.length}`);
      }
      if (address !== undefined) {
        values.push(address);
        sets.push(`address = $${values.length}`);
      }
      if (sets.length > 0) {
        values.push(req.params.projectId);
        await dbi.exec(
          `UPDATE projects SET ${sets.join(", ")} WHERE id = $${values.length}`,
          values,
        );
      }

      const rows = await dbi.query<{
        id: string;
        name: string;
        address: string | null;
        created_at: string;
        external_id: string | null;
        external_source: string | null;
      }>(
        `SELECT id, name, address, created_at, external_id, external_source
         FROM projects WHERE id = $1`,
        [req.params.projectId],
      );
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  });

  // Delete a project. Rooms + entries cascade via FK ON DELETE CASCADE.
  router.delete("/projects/:projectId", async (req, res, next) => {
    try {
      const dbi = getDbi();
      const existing = await dbi.query<{ id: string }>(
        `SELECT id FROM projects WHERE id = $1`,
        [req.params.projectId],
      );
      if (existing.length === 0) {
        res.status(404).json({ error: "project not found" });
        return;
      }
      await dbi.exec(`DELETE FROM projects WHERE id = $1`, [req.params.projectId]);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // Deep-clone a project: new project row + rooms + all trade entries.
  router.post("/projects/:projectId/duplicate", async (req, res, next) => {
    try {
      const dbi = getDbi();
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      const source = await dbi.query<{ id: string }>(
        `SELECT id FROM projects WHERE id = $1`,
        [req.params.projectId],
      );
      if (source.length === 0) {
        res.status(404).json({ error: "project not found" });
        return;
      }

      const newProjectId = await dbi.withTransaction(async (tx) => {
        const projectId = randomUUID();
        await tx.exec(
          `INSERT INTO projects (id, name, address) VALUES ($1, $2, $3)`,
          [projectId, name, null],
        );

        const sourceRooms = await tx.query<{ id: string; room_name: string }>(
          `SELECT id, room_name FROM rooms WHERE project_id = $1`,
          [req.params.projectId],
        );

        for (const room of sourceRooms) {
          const newRoomId = randomUUID();
          await tx.exec(
            `INSERT INTO rooms (id, project_id, room_name) VALUES ($1, $2, $3)`,
            [newRoomId, projectId, room.room_name],
          );

          for (const trade of TRADE_KINDS) {
            const table = ENTRY_TABLE_BY_TRADE[trade];
            const sourceEntries = await tx.query<Record<string, unknown>>(
              `SELECT * FROM ${table} WHERE room_id = $1`,
              [room.id],
            );
            for (const src of sourceEntries) {
              const cols: string[] = ["id", "room_id"];
              const vals: unknown[] = [randomUUID(), newRoomId];
              for (const key of Object.keys(src)) {
                if (ENTRY_COPY_SKIP.has(key)) continue;
                cols.push(key);
                vals.push(src[key]);
              }
              const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
              await tx.exec(
                `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
                vals,
              );
            }
          }
        }

        return projectId;
      });

      res.status(201).json({ id: newProjectId, name });
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

      // Trigger background scrape on tile entries that have enough context
      // to look up a real product photo. cacheKey matches the synthetic
      // (brand, style, color) hash used by the GET endpoint when sku is null.
      if (trade === "tile" && scrapeQueue) {
        const brand = typeof entry.brand === "string" ? entry.brand : "";
        const sku = typeof entry.sku === "string" ? entry.sku : "";
        const style = typeof entry.style === "string" ? entry.style : "";
        const color = typeof entry.color === "string" ? entry.color : "";
        const notes = typeof entry.notes === "string" ? entry.notes : "";
        if (brand && (sku || style || color)) {
          const cacheKey =
            sku ||
            "AUTO-" +
              crypto
                .createHash("sha1")
                .update([brand, style, color].join("|").toLowerCase())
                .digest("hex")
                .slice(0, 6);
          scrapeQueue.enqueue({
            brand,
            sku: sku || null,
            style: style || null,
            color: color || null,
            notes: notes || null,
            cacheKey,
          });
        }
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
