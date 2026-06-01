import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { TRADE_KINDS, ENTRY_TABLE_BY_TRADE, type TradeKind } from "@custom-homes/shared";
import type { Dbi } from "../db/dbi.js";
import { htmlToPdf } from "../services/pdf/generate.js";
import { renderProjectHtml } from "../services/pdf/html.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_DIR = path.resolve(__dirname, "../../pdfs");
const PDF_PREFIX = "/pdfs";

function isTrade(v: string): v is TradeKind {
  return (TRADE_KINDS as readonly string[]).includes(v);
}

async function loadRoomEntries(
  dbi: Dbi,
  roomId: string,
): Promise<Record<TradeKind, Record<string, unknown>[]>> {
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
      [roomId],
    );
    entriesByTrade[trade] = entries;
  }
  return entriesByTrade;
}

async function loadProject(dbi: Dbi, id: string) {
  const projects = await dbi.query<{
    id: string;
    name: string;
    address: string | null;
  }>(`SELECT id, name, address FROM projects WHERE id = $1`, [id]);
  if (projects.length === 0) return null;
  const project = projects[0]!;
  const roomRows = await dbi.query<{ id: string; room_name: string }>(
    `SELECT id, room_name FROM rooms WHERE project_id = $1 ORDER BY room_name`,
    [id],
  );
  const rooms = await Promise.all(
    roomRows.map(async (room) => ({
      ...room,
      entries_by_trade: await loadRoomEntries(dbi, room.id),
    })),
  );
  return { project, rooms };
}

async function loadProjectRoom(dbi: Dbi, projectId: string, roomId: string) {
  const projects = await dbi.query<{
    id: string;
    name: string;
    address: string | null;
  }>(`SELECT id, name, address FROM projects WHERE id = $1`, [projectId]);
  if (projects.length === 0) return null;
  const project = projects[0]!;
  // Verify the room belongs to this project — guards against cross-project leaks.
  const roomRows = await dbi.query<{ id: string; room_name: string }>(
    `SELECT id, room_name FROM rooms WHERE id = $1 AND project_id = $2`,
    [roomId, projectId],
  );
  if (roomRows.length === 0) return null;
  const roomRow = roomRows[0]!;
  const room = {
    ...roomRow,
    entries_by_trade: await loadRoomEntries(dbi, roomRow.id),
  };
  return { project, room };
}

// Filesystem-safe slug for a room name in Content-Disposition.
function sanitizeFilenamePart(s: string): string {
  return s.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "room";
}

async function collectImageMap(
  dbi: Dbi,
  rooms: { entries_by_trade: Record<string, Record<string, unknown>[]> }[],
): Promise<Map<string, string>> {
  const pairs = new Set<string>();
  for (const room of rooms) {
    for (const trade of TRADE_KINDS) {
      for (const e of room.entries_by_trade[trade] ?? []) {
        const brand = typeof e.brand === "string" ? e.brand : "";
        const sku = typeof e.sku === "string" ? e.sku : "";
        if (brand && sku) pairs.add(`${brand}|${sku}`);
      }
    }
  }
  const map = new Map<string, string>();
  if (pairs.size === 0) return map;
  const ors = Array.from(pairs)
    .map((_, i) => `(brand = $${i * 2 + 1} AND sku = $${i * 2 + 2})`)
    .join(" OR ");
  const params = Array.from(pairs).flatMap((p) => p.split("|"));
  const rows = await dbi.query<{ brand: string; sku: string; image_url: string }>(
    `SELECT brand, sku, image_url FROM manufacturer_images WHERE ${ors}`,
    params,
  );
  for (const r of rows) map.set(`${r.brand}|${r.sku}`, r.image_url);
  return map;
}

export function makePdfsRouter(getDbi: () => Dbi): Router {
  const router = Router();

  // Generate full project PDF (admin-only)
  router.post("/projects/:id/full", async (req, res, next) => {
    try {
      const dbi = getDbi();
      const data = await loadProject(dbi, req.params.id ?? "");
      if (!data) {
        res.status(404).json({ error: "project not found" });
        return;
      }
      const imageMap = await collectImageMap(dbi, data.rooms);
      const html = renderProjectHtml({
        project: data.project,
        rooms: data.rooms,
        imageByBrandSku: imageMap,
        generatedAt: new Date(),
      });
      const buf = await htmlToPdf(html, {
        projectName: data.project.name,
        centerLabel: "Full Selections",
      });
      await fs.mkdir(PDF_DIR, { recursive: true });
      const filename = `${data.project.id}-full.pdf`;
      await fs.writeFile(path.join(PDF_DIR, filename), buf);
      res.json({ pdf_url: `${PDF_PREFIX}/${filename}` });
    } catch (err) {
      next(err);
    }
  });

  // Generate per-trade PDF (admin-only)
  router.post("/projects/:id/trade/:trade", async (req, res, next) => {
    try {
      const trade = req.params.trade ?? "";
      const projectId = req.params.id ?? "";
      if (!isTrade(trade)) {
        res.status(400).json({ error: `unknown trade: ${trade}` });
        return;
      }
      const dbi = getDbi();
      const data = await loadProject(dbi, projectId);
      if (!data) {
        res.status(404).json({ error: "project not found" });
        return;
      }
      const imageMap = await collectImageMap(dbi, data.rooms);
      const html = renderProjectHtml({
        project: data.project,
        rooms: data.rooms,
        tradeFilter: trade,
        imageByBrandSku: imageMap,
        generatedAt: new Date(),
      });
      const tradeLabel = trade.charAt(0).toUpperCase() + trade.slice(1);
      const buf = await htmlToPdf(html, {
        projectName: data.project.name,
        centerLabel: `${tradeLabel} schedule`,
      });
      await fs.mkdir(PDF_DIR, { recursive: true });
      const filename = `${data.project.id}-${trade}.pdf`;
      await fs.writeFile(path.join(PDF_DIR, filename), buf);
      res.json({ pdf_url: `${PDF_PREFIX}/${filename}` });
    } catch (err) {
      next(err);
    }
  });

  // Per-room PDF: stream a single room's selections (all six trades) as a
  // download. Used by Tamara to hand one bathroom's spec to a sub.
  router.get("/projects/:projectId/rooms/:roomId", async (req, res, next) => {
    try {
      const projectId = req.params.projectId ?? "";
      const roomId = req.params.roomId ?? "";
      const dbi = getDbi();
      const data = await loadProjectRoom(dbi, projectId, roomId);
      if (!data) {
        res.status(404).json({ error: "room not found" });
        return;
      }
      const imageMap = await collectImageMap(dbi, [data.room]);
      const html = renderProjectHtml({
        project: data.project,
        rooms: [data.room],
        imageByBrandSku: imageMap,
        generatedAt: new Date(),
      });
      const buf = await htmlToPdf(html, {
        projectName: data.project.name,
        centerLabel: data.room.room_name,
      });
      const slug = sanitizeFilenamePart(data.room.room_name);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${slug}.pdf"`,
      );
      res.send(buf);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function pdfServeConfig() {
  return { dir: PDF_DIR, prefix: PDF_PREFIX };
}
