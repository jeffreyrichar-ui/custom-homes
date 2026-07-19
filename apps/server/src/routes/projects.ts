import { Router } from "express";
import { TRADE_KINDS, ENTRY_TABLE_BY_TRADE, type TradeKind } from "@custom-homes/shared";
import type { Dbi } from "../db/dbi.js";

export function makeProjectsRouter(getDbi: () => Dbi): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const dbi = getDbi();
      const rows = await dbi.query<{
        id: string;
        name: string;
        address: string | null;
        created_at: string;
        room_count: number | string;
      }>(
        `SELECT p.id, p.name, p.address, p.created_at,
                COUNT(r.id) AS room_count
         FROM projects p
         LEFT JOIN rooms r ON r.project_id = p.id
         GROUP BY p.id, p.name, p.address, p.created_at
         ORDER BY p.created_at DESC`,
      );

      // Entry count per project — UNION ALL over all six trade tables
      // joined through rooms, grouped by project. Single query, no N+1.
      const entryTables = TRADE_KINDS.map((k) => ENTRY_TABLE_BY_TRADE[k]);
      const entryUnionSql = entryTables
        .map((t) => `SELECT room_id FROM ${t}`)
        .join(" UNION ALL ");
      const entryCountRows = await dbi.query<{
        project_id: string;
        n: number | string;
      }>(
        `SELECT r.project_id AS project_id, COUNT(*) AS n
         FROM (${entryUnionSql}) e
         JOIN rooms r ON r.id = e.room_id
         GROUP BY r.project_id`,
      );
      const entryCountByProject = new Map<string, number>(
        entryCountRows.map((r) => [r.project_id, Number(r.n)]),
      );

      // Top brand per project — mode of brand across tile_entries, scoped per
      // project. Use a window-free pattern that works in both SQLite and
      // Postgres: aggregate brand counts per project, then DISTINCT ON-style
      // pick via correlated MAX in a wrapper. The portable form is a join on
      // (project_id, max_count) against the per-project max.
      const brandRows = await dbi.query<{
        project_id: string;
        brand: string;
        n: number | string;
      }>(
        `SELECT r.project_id AS project_id, t.brand AS brand, COUNT(*) AS n
         FROM tile_entries t
         JOIN rooms r ON r.id = t.room_id
         WHERE t.brand IS NOT NULL AND t.brand != ''
         GROUP BY r.project_id, t.brand
         ORDER BY r.project_id, n DESC, t.brand ASC`,
      );
      const topBrandByProject = new Map<string, string>();
      for (const row of brandRows) {
        // brandRows are ordered by (project_id, n DESC, brand ASC), so the
        // first row seen per project_id is the top brand.
        if (!topBrandByProject.has(row.project_id)) {
          topBrandByProject.set(row.project_id, row.brand);
        }
      }

      res.json({
        projects: rows.map((r) => ({
          id: r.id,
          name: r.name,
          address: r.address,
          created_at: r.created_at,
          room_count: Number(r.room_count),
          entry_count: entryCountByProject.get(r.id) ?? 0,
          top_brand: topBrandByProject.get(r.id) ?? null,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const dbi = getDbi();
      const projectRows = await dbi.query<{
        id: string;
        name: string;
        address: string | null;
        created_at: string;
        external_id: string | null;
        external_source: string | null;
      }>(
        `SELECT id, name, address, created_at, external_id, external_source
         FROM projects WHERE id = $1`,
        [req.params.id],
      );
      const project = projectRows[0];
      if (!project) {
        res.status(404).json({ error: "project not found" });
        return;
      }

      const roomRows = await dbi.query<{
        id: string;
        room_name: string;
        external_id: string | null;
      }>(
        `SELECT id, room_name, external_id
         FROM rooms WHERE project_id = $1 ORDER BY room_name`,
        [project.id],
      );

      const rooms = await Promise.all(
        roomRows.map(async (room) => {
          const entriesByTrade: Record<TradeKind, Record<string, unknown>[]> = {
            tile: [],
            paint: [],
            carpet: [],
            hardwood: [],
            cabinet: [],
            countertop: [],
          };
          for (const trade of TRADE_KINDS) {
            const table = ENTRY_TABLE_BY_TRADE[trade];
            const entries = await dbi.query(
              `SELECT * FROM ${table} WHERE room_id = $1 ORDER BY brand`,
              [room.id],
            );
            entriesByTrade[trade] = entries;
          }
          return { ...room, entries_by_trade: entriesByTrade };
        }),
      );

      res.json({ project, rooms });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
