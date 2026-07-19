import { Router } from "express";
import { TRADE_KINDS, ENTRY_TABLE_BY_TRADE, type TradeKind } from "@custom-homes/shared";
import type { Dbi } from "../db/dbi.js";

type EntryCounts = Record<TradeKind, number> & { total: number };

// Per-trade column expressions used to build the "label" tail.
// `detail` is COALESCEd to a single string column so the UNION ALL stays
// type-compatible across SQLite + Postgres.
const ENTRY_LABEL_COLUMNS: Record<TradeKind, { detail: string }> = {
  tile: { detail: "COALESCE(style, color, sku, '')" },
  paint: { detail: "COALESCE(color_name, sku, '')" },
  carpet: { detail: "COALESCE(style, color, sku, '')" },
  hardwood: { detail: "COALESCE(species, color, sku, '')" },
  cabinet: { detail: "COALESCE(style, color, '')" },
  countertop: { detail: "COALESCE(material, color, '')" },
};

type RecentActivityRow = {
  when: string;
  kind: "project" | "room" | "entry";
  trade: string | null;
  project_id: string;
  project_name: string;
  room_name: string | null;
  brand: string | null;
  detail: string | null;
};

function buildRecentActivityLabel(r: RecentActivityRow): string {
  if (r.kind === "project") {
    return `New project: ${r.project_name}`;
  }
  if (r.kind === "room") {
    return `Added ${r.room_name ?? "room"} to ${r.project_name}`;
  }
  const trade = r.trade ?? "entry";
  const brand = (r.brand ?? "").trim();
  const detail = (r.detail ?? "").trim();
  const head = [brand, detail].filter(Boolean).join(" ") || "(no details)";
  const room = r.room_name ? ` (${r.room_name})` : "";
  return `${trade} entry: ${head}${room}`;
}

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

      // Recent activity — UNION ALL across projects, rooms, and every *_entries
      // table, ordered by created_at desc. Each inner subquery is bounded by
      // LIMIT 10 so we never scan beyond what we need before the final sort.
      // Each branch is wrapped in a subquery so the inner ORDER BY + LIMIT
      // are legal inside a UNION ALL on both SQLite and Postgres.
      const activityParts: string[] = [];
      activityParts.push(
        `SELECT * FROM (
           SELECT p.created_at AS when_ts,
                  'project' AS kind,
                  NULL AS trade,
                  p.id AS project_id,
                  p.name AS project_name,
                  NULL AS room_name,
                  NULL AS brand,
                  NULL AS detail
           FROM projects p
           ORDER BY p.created_at DESC
           LIMIT 10
         ) sub_p`,
      );
      activityParts.push(
        `SELECT * FROM (
           SELECT r.created_at AS when_ts,
                  'room' AS kind,
                  NULL AS trade,
                  p.id AS project_id,
                  p.name AS project_name,
                  r.room_name AS room_name,
                  NULL AS brand,
                  NULL AS detail
           FROM rooms r
           JOIN projects p ON p.id = r.project_id
           ORDER BY r.created_at DESC
           LIMIT 10
         ) sub_r`,
      );
      for (const trade of TRADE_KINDS) {
        const table = ENTRY_TABLE_BY_TRADE[trade];
        const { detail } = ENTRY_LABEL_COLUMNS[trade];
        activityParts.push(
          `SELECT * FROM (
             SELECT e.created_at AS when_ts,
                    'entry' AS kind,
                    '${trade}' AS trade,
                    p.id AS project_id,
                    p.name AS project_name,
                    r.room_name AS room_name,
                    e.brand AS brand,
                    ${detail} AS detail
             FROM ${table} e
             JOIN rooms r ON r.id = e.room_id
             JOIN projects p ON p.id = r.project_id
             ORDER BY e.created_at DESC
             LIMIT 10
           ) sub_${trade}`,
        );
      }
      const recentSql = `SELECT * FROM (
        ${activityParts.join(" UNION ALL ")}
      ) all_recent
      ORDER BY when_ts DESC
      LIMIT 10`;
      const recentRows = await dbi.query<{
        // pg returns Date for timestamp columns; SQLite returns the stored string.
        when_ts: string | Date;
        kind: "project" | "room" | "entry";
        trade: string | null;
        project_id: string;
        project_name: string;
        room_name: string | null;
        brand: string | null;
        detail: string | null;
      }>(recentSql);

      const recent_activity = recentRows.map((r) => {
        const row: RecentActivityRow = {
          // SQLite serializes timestamps as "YYYY-MM-DD HH:MM:SS" in UTC with
          // no zone marker; Date.parse would read that as LOCAL time in the
          // browser and show fresh events hours off. Normalize to ISO + Z.
          when:
            r.when_ts instanceof Date
              ? r.when_ts.toISOString()
              : String(r.when_ts).includes("T")
                ? String(r.when_ts)
                : `${String(r.when_ts).replace(" ", "T")}Z`,
          kind: r.kind,
          trade: r.trade,
          project_id: r.project_id,
          project_name: r.project_name,
          room_name: r.room_name,
          brand: r.brand,
          detail: r.detail,
        };
        return {
          when: row.when,
          kind: row.kind,
          label: buildRecentActivityLabel(row),
          project_id: row.project_id,
          project_name: row.project_name,
        };
      });

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
        recent_activity,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
