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
      res.json({
        projects: rows.map((r) => ({
          id: r.id,
          name: r.name,
          address: r.address,
          created_at: r.created_at,
          room_count: Number(r.room_count),
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
