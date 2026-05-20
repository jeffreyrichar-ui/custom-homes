import { Router } from "express";
import { TRADE_KINDS, ENTRY_TABLE_BY_TRADE, type TradeKind } from "@custom-homes/shared";
import type { Dbi } from "../db/dbi.js";

type EntryCounts = Record<TradeKind, number> & { total: number };

export function makeStatsRouter(getDbi: () => Dbi): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const dbi = getDbi();
      const tables = TRADE_KINDS.map((k) => ENTRY_TABLE_BY_TRADE[k]);

      // Projects + rooms counts
      const [projectsRow] = await dbi.query<{ n: number | string }>(
        `SELECT COUNT(*) AS n FROM projects`,
      );
      const [roomsRow] = await dbi.query<{ n: number | string }>(
        `SELECT COUNT(*) AS n FROM rooms`,
      );

      // Per-trade entry counts
      const counts = {} as EntryCounts;
      let total = 0;
      for (const trade of TRADE_KINDS) {
        const table = ENTRY_TABLE_BY_TRADE[trade];
        const [row] = await dbi.query<{ n: number | string }>(
          `SELECT COUNT(*) AS n FROM ${table}`,
        );
        const n = Number(row?.n ?? 0);
        counts[trade] = n;
        total += n;
      }
      counts.total = total;

      // Top brands across all trades (UNION ALL pattern from suggest.ts)
      const brandsUnionSql = tables
        .map((t) => `SELECT brand, COUNT(*) AS n FROM ${t} GROUP BY brand`)
        .join(" UNION ALL ");
      const brandRows = await dbi.query<{ brand: string; n: number | string }>(
        `SELECT brand, SUM(n) AS n FROM (${brandsUnionSql}) sub
         WHERE brand IS NOT NULL AND brand != ''
         GROUP BY brand ORDER BY n DESC, brand ASC
         LIMIT 5`,
      );

      // Top vendors — tile-only (vendor column lives only on tile_entries)
      const vendorRows = await dbi.query<{ vendor: string; n: number | string }>(
        `SELECT vendor, COUNT(*) AS n FROM tile_entries
         WHERE vendor IS NOT NULL AND vendor != ''
         GROUP BY vendor ORDER BY n DESC, vendor ASC
         LIMIT 5`,
      );

      // Novel entries — count where is_new_entry is true across all *_entries tables
      const novelUnionSql = tables
        .map(
          (t) =>
            `SELECT COUNT(*) AS n FROM ${t} WHERE is_new_entry = ${dbi.kind === "sqlite" ? 1 : "TRUE"}`,
        )
        .join(" UNION ALL ");
      const novelRows = await dbi.query<{ n: number | string }>(
        `SELECT SUM(n) AS n FROM (${novelUnionSql}) sub`,
      );

      res.json({
        projects: Number(projectsRow?.n ?? 0),
        rooms: Number(roomsRow?.n ?? 0),
        entries: counts,
        top_brands: brandRows.map((r) => ({
          brand: r.brand,
          count: Number(r.n),
        })),
        top_vendors: vendorRows.map((r) => ({
          vendor: r.vendor,
          count: Number(r.n),
        })),
        novel_entries: Number(novelRows[0]?.n ?? 0),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
