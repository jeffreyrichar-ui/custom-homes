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

export function makeSuggestRouter(getDbi: () => Dbi): Router {
  const router = Router();

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

  return router;
}
