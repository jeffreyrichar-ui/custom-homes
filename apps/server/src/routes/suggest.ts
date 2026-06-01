import { Router } from "express";
import { TRADE_KINDS, ENTRY_TABLE_BY_TRADE, type TradeKind } from "@custom-homes/shared";
import type { Dbi } from "../db/dbi.js";

function isTradeKind(value: unknown): value is TradeKind {
  return typeof value === "string" && (TRADE_KINDS as readonly string[]).includes(value);
}

type SuggestParams = { trade?: TradeKind; brand?: string; style?: string; color?: string };

function parseTrade(req: import("express").Request): TradeKind | null {
  const raw = req.query.trade;
  return isTradeKind(raw) ? raw : null;
}

// Logical field name → physical column for a given trade.
// Returns null when the trade table does not have that column at all
// (e.g. `pattern` does not exist on paint/carpet/cabinet/countertop).
function columnFor(trade: TradeKind, field: string): string | null {
  switch (field) {
    case "brand":
      return "brand";
    case "sku":
      // Cabinet/countertop have no sku column today.
      return trade === "cabinet" || trade === "countertop" ? null : "sku";
    case "style":
      if (trade === "hardwood") return "species";
      if (trade === "countertop") return "material";
      // Paint has no style-like column.
      if (trade === "paint") return null;
      return "style";
    case "color":
      return trade === "paint" ? "color_name" : "color";
    case "pattern":
      return trade === "tile" || trade === "hardwood" ? "pattern" : null;
    case "edge_profile":
      return trade === "tile" || trade === "countertop" ? "edge_profile" : null;
    default:
      return null;
  }
}

// Fields the "complete this entry" endpoint can fill in.
const COMPLETABLE_FIELDS = ["brand", "style", "color", "sku", "pattern", "edge_profile"] as const;
type CompletableField = (typeof COMPLETABLE_FIELDS)[number];

export function makeSuggestRouter(getDbi: () => Dbi): Router {
  const router = Router();

  // Distinct vendors (tile only — vendor column doesn't exist on other trades yet)
  router.get("/vendors", async (_req, res, next) => {
    try {
      const rows = await getDbi().query<{ vendor: string; n: number | string }>(
        `SELECT vendor, COUNT(*) AS n FROM tile_entries
         WHERE vendor IS NOT NULL AND vendor != ''
         GROUP BY vendor ORDER BY n DESC, vendor ASC`,
      );
      res.json({ vendors: rows.map((r) => ({ value: r.vendor, count: Number(r.n) })) });
    } catch (err) {
      next(err);
    }
  });

  // Distinct brands. Optional ?trade=tile narrows to that trade.
  router.get("/brands", async (req, res, next) => {
    try {
      const dbi = getDbi();
      const trade = parseTrade(req);
      const tables = trade ? [ENTRY_TABLE_BY_TRADE[trade]] : TRADE_KINDS.map((k) => ENTRY_TABLE_BY_TRADE[k]);
      const unionSql = tables
        .map((t) => `SELECT brand, COUNT(*) AS n FROM ${t} GROUP BY brand`)
        .join(" UNION ALL ");
      const rows = await dbi.query<{ brand: string; n: number | string }>(
        `SELECT brand, SUM(n) AS n FROM (${unionSql}) sub
         WHERE brand IS NOT NULL AND brand != ''
         GROUP BY brand ORDER BY n DESC, brand ASC`,
      );
      res.json({ brands: rows.map((r) => ({ value: r.brand, count: Number(r.n) })) });
    } catch (err) {
      next(err);
    }
  });

  // Distinct styles for a brand. Requires ?trade and ?brand.
  router.get("/styles", async (req, res, next) => {
    try {
      const trade = parseTrade(req);
      const brand = typeof req.query.brand === "string" ? req.query.brand : null;
      if (!trade || !brand) {
        res.status(400).json({ error: "trade and brand query params required" });
        return;
      }
      const table = ENTRY_TABLE_BY_TRADE[trade];
      // 'style' column doesn't exist on every trade — use a column that's the closest analog
      const styleCol = trade === "hardwood" ? "species" : trade === "countertop" ? "material" : "style";
      const rows = await getDbi().query<{ style: string; n: number | string }>(
        `SELECT ${styleCol} AS style, COUNT(*) AS n FROM ${table}
         WHERE brand = $1 AND ${styleCol} IS NOT NULL AND ${styleCol} != ''
         GROUP BY ${styleCol} ORDER BY n DESC, ${styleCol} ASC`,
        [brand],
      );
      res.json({ styles: rows.map((r) => ({ value: r.style, count: Number(r.n) })) });
    } catch (err) {
      next(err);
    }
  });

  // Distinct colors for a brand+style. Returns most-recent image_url for each.
  router.get("/colors", async (req, res, next) => {
    try {
      const trade = parseTrade(req);
      const brand = typeof req.query.brand === "string" ? req.query.brand : null;
      const style = typeof req.query.style === "string" ? req.query.style : null;
      if (!trade || !brand) {
        res.status(400).json({ error: "trade and brand query params required" });
        return;
      }
      const table = ENTRY_TABLE_BY_TRADE[trade];
      // Cabinet has no "color" until... wait, it does. countertop has color too. Paint uses color_name.
      const colorCol = trade === "paint" ? "color_name" : "color";
      const styleCol = trade === "hardwood" ? "species" : trade === "countertop" ? "material" : "style";
      const params: unknown[] = [brand];
      let where = `brand = $1 AND ${colorCol} IS NOT NULL AND ${colorCol} != ''`;
      if (style) {
        params.push(style);
        where += ` AND ${styleCol} = $2`;
      }
      const rows = await getDbi().query<{ color: string; image_url: string | null; n: number | string }>(
        `SELECT ${colorCol} AS color, MAX(image_url) AS image_url, COUNT(*) AS n
         FROM ${table}
         WHERE ${where}
         GROUP BY ${colorCol}
         ORDER BY n DESC, ${colorCol} ASC`,
        params,
      );
      res.json({
        colors: rows.map((r) => ({ value: r.color, image_url: r.image_url, count: Number(r.n) })),
      });
    } catch (err) {
      next(err);
    }
  });

  // Distinct SKUs for a brand+color (used by SKU autocomplete + most-recent-SKU pre-fill on Color lock).
  router.get("/skus", async (req, res, next) => {
    try {
      const trade = parseTrade(req);
      const brand = typeof req.query.brand === "string" ? req.query.brand : null;
      const color = typeof req.query.color === "string" ? req.query.color : null;
      if (!trade || !brand) {
        res.status(400).json({ error: "trade and brand query params required" });
        return;
      }
      const table = ENTRY_TABLE_BY_TRADE[trade];
      const colorCol = trade === "paint" ? "color_name" : "color";
      const params: unknown[] = [brand];
      let where = `brand = $1 AND sku IS NOT NULL AND sku != ''`;
      if (color) {
        params.push(color);
        where += ` AND ${colorCol} = $2`;
      }
      const rows = await getDbi().query<{ sku: string; n: number | string; created_at: string }>(
        `SELECT sku, COUNT(*) AS n, MAX(created_at) AS created_at
         FROM ${table}
         WHERE ${where}
         GROUP BY sku
         ORDER BY created_at DESC, n DESC`,
        params,
      );
      res.json({ skus: rows.map((r) => ({ value: r.sku, count: Number(r.n) })) });
    } catch (err) {
      next(err);
    }
  });

  // Lookup the historical SKU for a brand+color combo (used to validate and pre-fill).
  router.get("/sku-for-color", async (req, res, next) => {
    try {
      const trade = parseTrade(req);
      const brand = typeof req.query.brand === "string" ? req.query.brand : null;
      const color = typeof req.query.color === "string" ? req.query.color : null;
      if (!trade || !brand || !color) {
        res.status(400).json({ error: "trade, brand, and color required" });
        return;
      }
      const table = ENTRY_TABLE_BY_TRADE[trade];
      const colorCol = trade === "paint" ? "color_name" : "color";
      const rows = await getDbi().query<{ sku: string }>(
        `SELECT sku FROM ${table}
         WHERE brand = $1 AND ${colorCol} = $2 AND sku IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
        [brand, color],
      );
      res.json({ sku: rows[0]?.sku ?? null });
    } catch (err) {
      next(err);
    }
  });

  // POST /complete — given a partial entry, infer the most likely value
  // for each empty field by finding historical entries that match the
  // non-empty fields and taking the modal value of each empty column.
  // Confidence is simply mode_count / candidate_count, capped to [0, 1].
  router.post("/complete", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as {
        trade?: unknown;
        partial?: Record<string, unknown>;
      };
      if (!isTradeKind(body.trade)) {
        res.status(400).json({ error: "trade is required" });
        return;
      }
      const trade = body.trade;
      const partial = (body.partial && typeof body.partial === "object" ? body.partial : {}) as Record<string, unknown>;
      const table = ENTRY_TABLE_BY_TRADE[trade];

      // Build WHERE clause from any non-empty completable field that has a column on this trade.
      const filters: { col: string; value: string }[] = [];
      for (const field of COMPLETABLE_FIELDS) {
        const raw = partial[field];
        const v = typeof raw === "string" ? raw.trim() : "";
        if (!v) continue;
        const col = columnFor(trade, field);
        if (!col) continue;
        filters.push({ col, value: v });
      }

      // Empty partial → no candidates, return null suggestions for every applicable empty field.
      if (filters.length === 0) {
        const empty: Record<string, { value: string | null; confidence: number }> = {};
        for (const field of COMPLETABLE_FIELDS) {
          if (columnFor(trade, field)) {
            empty[field] = { value: null, confidence: 0 };
          }
        }
        res.json({ suggestions: empty, candidate_count: 0 });
        return;
      }

      // Pull a capped sample of historical rows matching all provided fields (case-insensitive).
      const params: unknown[] = [];
      const whereParts = filters.map((f) => {
        params.push(f.value);
        return `LOWER(${f.col}) = LOWER($${params.length})`;
      });

      // SELECT every column we may want to infer. We only project the columns
      // that actually exist on this trade's table so the SQL stays valid.
      const inferable: { field: CompletableField; col: string }[] = [];
      for (const field of COMPLETABLE_FIELDS) {
        const col = columnFor(trade, field);
        if (col) inferable.push({ field, col });
      }
      const selectCols = inferable.map((i) => i.col).join(", ");

      const rows = await getDbi().query<Record<string, string | null>>(
        `SELECT ${selectCols} FROM ${table}
         WHERE ${whereParts.join(" AND ")}
         LIMIT 200`,
        params,
      );

      const candidateCount = rows.length;
      const suggestions: Record<string, { value: string | null; confidence: number }> = {};

      for (const { field, col } of inferable) {
        // Only suggest for fields the user left empty.
        const raw = partial[field];
        const userProvided = typeof raw === "string" && raw.trim() !== "";
        if (userProvided) continue;
        if (candidateCount === 0) {
          suggestions[field] = { value: null, confidence: 0 };
          continue;
        }
        // Tally non-empty values for this column.
        const counts = new Map<string, number>();
        for (const row of rows) {
          const v = row[col];
          if (v == null || v === "") continue;
          counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        if (counts.size === 0) {
          suggestions[field] = { value: null, confidence: 0 };
          continue;
        }
        let bestValue = "";
        let bestCount = 0;
        for (const [value, n] of counts) {
          if (n > bestCount) {
            bestCount = n;
            bestValue = value;
          }
        }
        suggestions[field] = {
          value: bestValue,
          confidence: Math.min(1, bestCount / candidateCount),
        };
      }

      res.json({ suggestions, candidate_count: candidateCount });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
