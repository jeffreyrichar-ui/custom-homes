import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import supertest from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exampleProject } from "@custom-homes/shared";
import type { AppDb } from "../src/db/client.js";
import { makeDbi } from "../src/db/dbi.js";
import * as sqliteSchema from "../src/db/schema.sqlite.js";
import { makeAdminImportRouter } from "../src/routes/adminImport.js";
import { makePdfsRouter } from "../src/routes/pdfs.js";
import { renderPatternSvg } from "../src/services/pdf/patternSvg.js";
import { renderProjectHtml } from "../src/services/pdf/html.js";

// Puppeteer can't run in the sandbox — replace the renderer with a stub that
// echoes the HTML byte length so route assertions stay deterministic.
vi.mock("../src/services/pdf/generate.js", () => ({
  htmlToPdf: vi.fn(async (html: string) => Buffer.from(`%PDF-1.4-stub-${html.length}`)),
  closePdfBrowser: vi.fn(async () => {}),
}));

type FixtureEntry = Record<string, unknown>;
type FixtureRoom = {
  id: string;
  room_name: string;
  entries_by_trade: Record<string, FixtureEntry[]>;
};

describe("renderPatternSvg", () => {
  it("returns a string containing '<svg' and resolves the input grout color as hex", () => {
    const svg = renderPatternSvg({ groutColor: "#abc123", notes: "12x24" });
    expect(typeof svg).toBe("string");
    expect(svg).toContain("<svg");
    expect(svg).toContain("#abc123");
  });

  it("renders penny round shapes as circles when notes say 'penny round'", () => {
    const svg = renderPatternSvg({ notes: "2 inch penny round" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("<circle");
  });

  it("renders hexagon shapes as polygons when notes say 'hex'", () => {
    const svg = renderPatternSvg({ notes: "3 inch hex" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("<polygon");
  });

  it("renders picket shapes as a 6-point polygon with pointed top and bottom", () => {
    const svg = renderPatternSvg({ notes: "picket tile" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("<polygon");
    // The picket polygon should have exactly 6 points per tile:
    // top-middle, top-right, bottom-right, bottom-middle, bottom-left, top-left.
    // We pull the first <polygon points="..."/> and assert it has 6 coordinate pairs.
    const m = svg.match(/<polygon points="([^"]+)"/);
    expect(m).not.toBeNull();
    const pts = m![1]!.trim().split(/\s+/);
    expect(pts).toHaveLength(6);
    // Picket shape: first and fourth points share the same x (middle),
    // with the first having the smallest y (pointed top) and the fourth the largest (pointed bottom).
    const xy = pts.map((p) => p.split(",").map(Number) as [number, number]);
    const [topMidX, topMidY] = xy[0]!;
    const [bottomMidX, bottomMidY] = xy[3]!;
    expect(topMidX).toBeCloseTo(bottomMidX);
    expect(topMidY).toBeLessThan(bottomMidY);
    // Pointed top: the second/sixth points sit lower than the top-middle.
    expect(xy[1]![1]).toBeGreaterThan(topMidY);
    expect(xy[5]![1]).toBeGreaterThan(topMidY);
    // Pointed bottom: the third/fifth points sit higher than the bottom-middle.
    expect(xy[2]![1]).toBeLessThan(bottomMidY);
    expect(xy[4]![1]).toBeLessThan(bottomMidY);
  });

  it("renders plain rectangle inputs as rects with non-equal width and height", () => {
    const svg = renderPatternSvg({ notes: "12x24" });
    expect(svg).toContain("<rect");
    // Find a tile <rect> (skip the first one which is the full-svg grout backing).
    // The tile rects use the placeholder fill #d8d2c4.
    const tileRect = svg.match(/<rect [^>]*fill="#d8d2c4"[^>]*\/>/);
    expect(tileRect).not.toBeNull();
    const w = tileRect![0].match(/width="([\d.]+)"/);
    const h = tileRect![0].match(/height="([\d.]+)"/);
    expect(w).not.toBeNull();
    expect(h).not.toBeNull();
    expect(parseFloat(w![1]!)).not.toBeCloseTo(parseFloat(h![1]!));
  });

  it("renders square inputs as rects with equal tile width and height", () => {
    const svg = renderPatternSvg({ notes: "4x4" });
    expect(svg).toContain("<rect");
    // Verify the viewBox + grid math: a 5x4 grid of square tiles + 2px grout
    // should yield viewBox dims where (totalW - groutOffsets) / cols == (totalH - groutOffsets) / rows.
    const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    expect(vb).not.toBeNull();
    const totalW = parseFloat(vb![1]!);
    const totalH = parseFloat(vb![2]!);
    const cols = 5;
    const rows = 4;
    const groutWidth = 2;
    const tileW = (totalW - groutWidth * (cols + 1)) / cols;
    const tileH = (totalH - groutWidth * (rows + 1)) / rows;
    expect(tileW).toBeCloseTo(tileH);
    // And a tile <rect> should be square.
    const tileRect = svg.match(/<rect [^>]*fill="#d8d2c4"[^>]*\/>/);
    expect(tileRect).not.toBeNull();
    const w = parseFloat(tileRect![0].match(/width="([\d.]+)"/)![1]!);
    const h = parseFloat(tileRect![0].match(/height="([\d.]+)"/)![1]!);
    expect(w).toBeCloseTo(h);
  });

  it("renders <image href=...> elements when imageUrl is provided", () => {
    const url = "https://example.com/tile.png";
    const svg = renderPatternSvg({ imageUrl: url, notes: "12x24" });
    expect(svg).toContain("<image href=");
    expect(svg).toContain(url);
  });

  it("resolves the named grout color 'Bleached Wood' to '#c9bfa9'", () => {
    const svg = renderPatternSvg({ groutColor: "Bleached Wood", notes: "12x24" });
    expect(svg).toContain("#c9bfa9");
  });

  it("passes through a literal hex grout color like '#abc123'", () => {
    const svg = renderPatternSvg({ groutColor: "#abc123", notes: "12x24" });
    expect(svg).toContain("#abc123");
  });
});

describe("renderProjectHtml", () => {
  const project = {
    id: "p1",
    name: "Maple St Renovation",
    address: "123 Maple St",
  };
  const generatedAt = new Date("2026-05-18T00:00:00Z");
  const imageByBrandSku = new Map<string, string>();

  it("produces valid HTML wrapping (doctype + matching html tags)", () => {
    const html = renderProjectHtml({
      project,
      rooms: [],
      imageByBrandSku,
      generatedAt,
    });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("renders one <section class=\"room\"> per room in the full project layout", () => {
    const rooms: FixtureRoom[] = [
      {
        id: "r1",
        room_name: "Primary Bath",
        entries_by_trade: {
          tile: [{ brand: "Daltile", sku: "T-1", location_in_room: "floor" }],
        },
      },
      {
        id: "r2",
        room_name: "Guest Bath",
        entries_by_trade: {
          paint: [{ brand: "Sherwin-Williams", color_name: "Alabaster", sku: "SW-7008" }],
        },
      },
    ];
    const html = renderProjectHtml({
      project,
      rooms,
      imageByBrandSku,
      generatedAt,
    });
    const sectionMatches = html.match(/<section class="room">/g);
    expect(sectionMatches).not.toBeNull();
    expect(sectionMatches!.length).toBe(2);
    expect(html).toContain("Primary Bath");
    expect(html).toContain("Guest Bath");
  });

  it("renders a TOC on the full-project book listing every room with total counts", () => {
    const rooms: FixtureRoom[] = [
      {
        id: "r1",
        room_name: "Primary Bath",
        entries_by_trade: {
          tile: [
            { brand: "Daltile", sku: "T-1", location_in_room: "floor" },
            { brand: "Daltile", sku: "T-2", location_in_room: "shower_walls" },
          ],
          paint: [{ brand: "Sherwin-Williams", color_name: "Alabaster", sku: "SW-7008" }],
        },
      },
      {
        id: "r2",
        room_name: "Guest Bath",
        entries_by_trade: {
          hardwood: [{ brand: "Shaw", species: "White Oak", sku: "H-1" }],
        },
      },
      {
        id: "r3",
        room_name: "Powder Room",
        entries_by_trade: {},
      },
    ];
    const html = renderProjectHtml({
      project,
      rooms,
      imageByBrandSku,
      generatedAt,
    });
    const toc = html.match(/<section class="toc-page">[\s\S]*?<\/section>/);
    expect(toc).not.toBeNull();
    // Every room is listed; populated rooms link to their section anchor.
    // Zero-entry rooms render no body section, so their TOC row is muted
    // and unlinked rather than a dead in-document link.
    expect(toc![0]).toContain("Primary Bath");
    expect(toc![0]).toContain("Guest Bath");
    expect(toc![0]).toContain("Powder Room");
    expect(toc![0]).toContain('href="#room-r1"');
    expect(toc![0]).toContain('href="#room-r2"');
    expect(toc![0]).not.toContain('href="#room-r3"');
    // Counts are totals across all trades: 2 tile + 1 paint, 1 hardwood, none.
    expect(toc![0]).toContain("3 entries");
    expect(toc![0]).toContain("1 entry");
    expect(toc![0]).toContain("0 entries");
    // Only the zero-entry room is muted.
    const mutedRows = toc![0].match(/<li class="toc-row muted">[\s\S]*?<\/li>/g);
    expect(mutedRows).toHaveLength(1);
    expect(mutedRows![0]).toContain("Powder Room");
    expect(mutedRows![0]).toContain("0 entries");
    // Room sections still render for populated rooms only.
    expect(html.match(/<section class="room">/g)!.length).toBe(2);
  });

  it("uses per-room paging layout and subtitle for tradeFilter='tile'", () => {
    const rooms: FixtureRoom[] = [
      {
        id: "r1",
        room_name: "Primary Bath",
        entries_by_trade: {
          tile: [{ brand: "Daltile", sku: "T-1", location_in_room: "floor" }],
        },
      },
    ];
    const html = renderProjectHtml({
      project,
      rooms,
      tradeFilter: "tile",
      imageByBrandSku,
      generatedAt,
    });
    expect(html).toContain('class="room-page"');
    expect(html).toContain("page-break-after: always");
    expect(html).toContain("Per-room tile reference. One bathroom per page.");
  });

  it("sorts entries in spatial order in the per-trade layout", () => {
    const rooms: FixtureRoom[] = [
      {
        id: "r1",
        room_name: "Primary Bath",
        entries_by_trade: {
          tile: [
            { brand: "B", sku: "VAN", location_in_room: "vanity_backsplash", notes: "vanity note" },
            { brand: "B", sku: "TUB", location_in_room: "tub_surround", notes: "tub note" },
            { brand: "B", sku: "NICHE", location_in_room: "shower_niche", notes: "niche note" },
            { brand: "B", sku: "WALL", location_in_room: "shower_walls", notes: "wall note" },
            { brand: "B", sku: "FLR", location_in_room: "floor", notes: "floor note" },
          ],
        },
      },
    ];
    const html = renderProjectHtml({
      project,
      rooms,
      tradeFilter: "tile",
      imageByBrandSku,
      generatedAt,
    });
    // Each entry's notes are unique, so we can locate their offsets in the
    // rendered HTML and assert the correct ordering.
    const idxFloor = html.indexOf("floor note");
    const idxWall = html.indexOf("wall note");
    const idxNiche = html.indexOf("niche note");
    const idxTub = html.indexOf("tub note");
    const idxVan = html.indexOf("vanity note");
    expect(idxFloor).toBeGreaterThan(-1);
    expect(idxWall).toBeGreaterThan(-1);
    expect(idxNiche).toBeGreaterThan(-1);
    expect(idxTub).toBeGreaterThan(-1);
    expect(idxVan).toBeGreaterThan(-1);
    expect(idxFloor).toBeLessThan(idxWall);
    expect(idxWall).toBeLessThan(idxNiche);
    expect(idxNiche).toBeLessThan(idxTub);
    expect(idxTub).toBeLessThan(idxVan);
  });

  it("renders grout-color chips in the room header for the per-trade layout", () => {
    const rooms: FixtureRoom[] = [
      {
        id: "r1",
        room_name: "Primary Bath",
        entries_by_trade: {
          tile: [
            { brand: "Daltile", sku: "T-1", location_in_room: "floor", grout_color: "Bleached Wood" },
            { brand: "Daltile", sku: "T-2", location_in_room: "shower_walls", grout_color: "Snow White" },
          ],
        },
      },
    ];
    const html = renderProjectHtml({
      project,
      rooms,
      tradeFilter: "tile",
      imageByBrandSku,
      generatedAt,
    });
    expect(html).toContain('class="chip grout"');
    expect(html).toContain("grout: Bleached Wood");
    expect(html).toContain("grout: Snow White");
  });

  it("renders notes inside a <div class=\"entry-notes\"> block", () => {
    const rooms: FixtureRoom[] = [
      {
        id: "r1",
        room_name: "Primary Bath",
        entries_by_trade: {
          tile: [
            {
              brand: "Daltile",
              sku: "T-1",
              location_in_room: "floor",
              notes: "Lay parallel with vanity",
            },
          ],
        },
      },
    ];
    const html = renderProjectHtml({
      project,
      rooms,
      imageByBrandSku,
      generatedAt,
    });
    expect(html).toContain('<div class="entry-notes">');
    expect(html).toContain("Lay parallel with vanity");
    // The notes string should appear inside the entry-notes div.
    const noteBlock = html.match(/<div class="entry-notes">([^<]*)<\/div>/);
    expect(noteBlock).not.toBeNull();
    expect(noteBlock![1]).toContain("Lay parallel with vanity");
  });
});

// ----- Per-room PDF route -----
// These tests boot a minimal Express app wired to the PDF + admin-import
// routers against an in-memory SQLite. htmlToPdf is mocked at the top of the
// file so we never spin up Puppeteer.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(__dirname, "../src/db/migrations/sqlite");

function buildPdfTestApp() {
  const client = new Database(":memory:");
  client.pragma("foreign_keys = ON");
  const d = drizzle(client, { schema: sqliteSchema });
  migrate(d, { migrationsFolder: MIGRATIONS });
  const db: AppDb = { kind: "sqlite", client, drizzle: d, schema: sqliteSchema };
  const dbi = makeDbi(db);

  const app = express();
  app.use(express.json({ limit: "5mb" }));
  // adminImport runs unauthenticated here — auth is exercised elsewhere.
  app.use("/api/admin", makeAdminImportRouter(() => dbi));
  app.use("/api/pdfs", makePdfsRouter(() => dbi));
  return { app, client };
}

async function importTwoProjects(app: express.Express) {
  // Project A: from the example fixture (has a "Master Bath" room + others).
  const a = await supertest(app).post("/api/admin/import").send(exampleProject);
  expect(a.status).toBe(200);
  const aId: string = a.body.project_id;

  // Project B: a second independent project so we can exercise cross-project 404.
  // Must use a distinct external_id, otherwise the importer upserts onto project A.
  const second = {
    ...exampleProject,
    external_id: "BT-job-9999",
    project: { ...exampleProject.project, name: "Other House", address: "999 Other St" },
    rooms: [
      {
        room_name: "Powder Room",
        entries: [
          {
            trade: "paint",
            brand: "Sherwin-Williams",
            color_name: "Repose Gray",
            sku: "SW7015",
            sheen: "matte",
            surface_application: "walls",
          },
        ],
      },
    ],
  };
  const b = await supertest(app).post("/api/admin/import").send(second);
  expect(b.status).toBe(200);
  const bId: string = b.body.project_id;
  expect(bId).not.toBe(aId);

  return { aId, bId };
}

describe("GET /api/pdfs/projects/:projectId/rooms/:roomId", () => {
  let ctx: ReturnType<typeof buildPdfTestApp>;
  beforeEach(() => {
    ctx = buildPdfTestApp();
  });
  afterEach(() => {
    ctx.client.close();
  });

  it("returns 200 with application/pdf content-type for a valid room", async () => {
    const { aId } = await importTwoProjects(ctx.app);
    const rooms = ctx.client
      .prepare("SELECT id, room_name FROM rooms WHERE project_id = ?")
      .all(aId) as { id: string; room_name: string }[];
    expect(rooms.length).toBeGreaterThan(0);
    const room = rooms[0]!;
    const res = await supertest(ctx.app).get(
      `/api/pdfs/projects/${aId}/rooms/${room.id}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    // The mocked renderer returns a recognisable %PDF-1.4-stub payload.
    expect(res.body.toString().startsWith("%PDF-1.4-stub")).toBe(true);
  });

  it("sets content-disposition with a filename containing the sanitized room name", async () => {
    const { aId } = await importTwoProjects(ctx.app);
    const rooms = ctx.client
      .prepare("SELECT id, room_name FROM rooms WHERE project_id = ?")
      .all(aId) as { id: string; room_name: string }[];
    const room = rooms[0]!;
    const res = await supertest(ctx.app).get(
      `/api/pdfs/projects/${aId}/rooms/${room.id}`,
    );
    expect(res.status).toBe(200);
    const disp = res.headers["content-disposition"] ?? "";
    expect(disp).toContain("attachment");
    expect(disp).toContain(".pdf");
    // Spaces become hyphens in the sanitized filename.
    const slug = room.room_name.replace(/[^a-z0-9-_]+/gi, "-");
    expect(disp).toContain(slug);
  });

  it("returns 404 when the room belongs to a different project", async () => {
    const { aId, bId } = await importTwoProjects(ctx.app);
    const bRooms = ctx.client
      .prepare("SELECT id FROM rooms WHERE project_id = ?")
      .all(bId) as { id: string }[];
    expect(bRooms.length).toBeGreaterThan(0);
    const foreignRoom = bRooms[0]!;
    // Ask for project A but pass a room id from project B.
    const res = await supertest(ctx.app).get(
      `/api/pdfs/projects/${aId}/rooms/${foreignRoom.id}`,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown project id", async () => {
    const res = await supertest(ctx.app).get(
      `/api/pdfs/projects/does-not-exist/rooms/also-missing`,
    );
    expect(res.status).toBe(404);
  });
});
