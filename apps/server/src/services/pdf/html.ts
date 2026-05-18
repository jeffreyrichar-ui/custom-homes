import { TRADE_KINDS, type TradeKind } from "@custom-homes/shared";
import { renderPatternSvg } from "./patternSvg.js";

type Project = {
  id: string;
  name: string;
  address: string | null;
};

type Entry = Record<string, unknown>;
type Room = {
  id: string;
  room_name: string;
  entries_by_trade: Record<string, Entry[]>;
};

function esc(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SPEC_FIELDS_BY_TRADE: Record<TradeKind, string[]> = {
  tile: ["brand", "style", "color", "sku", "grout_color", "grout_sku", "edge_profile", "pattern", "location_in_room", "vendor"],
  paint: ["brand", "color_name", "sku", "sheen", "surface_application"],
  carpet: ["brand", "style", "color", "sku", "pile"],
  hardwood: ["brand", "species", "color", "sku", "plank_width", "pattern"],
  cabinet: ["brand", "style", "color", "hardware"],
  countertop: ["material", "brand", "color", "edge_profile"],
};

const LOCATION_ORDER: Record<string, number> = {
  floor: 1,
  shower_floor: 2,
  shower_walls: 3,
  shower_walls_accent: 4,
  shower_niche: 5,
  shower_bench: 6,
  tub_surround: 7,
  vanity_backsplash: 8,
  backsplash: 9,
  kitchen_backsplash: 10,
  wainscot: 11,
  fireplace: 12,
};

function entryCardHtml(
  trade: TradeKind,
  e: Entry,
  imageByBrandSku: Map<string, string>,
): string {
  const brand = String(e.brand ?? "");
  const sku = String(e.sku ?? "");
  const url = imageByBrandSku.get(`${brand}|${sku}`) ?? null;
  const fields = SPEC_FIELDS_BY_TRADE[trade] ?? [];

  let preview = "";
  if (trade === "tile") {
    preview = renderPatternSvg({
      imageUrl: url,
      groutColor: String(e.grout_color ?? "") || null,
      pattern: String(e.pattern ?? "") || null,
      style: String(e.style ?? "") || null,
      color: String(e.color ?? "") || null,
      notes: String(e.notes ?? "") || null,
      cols: 5,
      rows: 4,
    });
  } else if (trade === "paint") {
    preview = `<div class="paint-swatch"></div>`;
  } else if (url) {
    preview = `<img class="entry-thumb" src="${esc(url)}"/>`;
  }

  const specRows = fields
    .filter((k) => e[k] != null && e[k] !== "")
    .map((k) => `<tr><th>${esc(k.replace(/_/g, " "))}</th><td>${esc(e[k])}</td></tr>`)
    .join("");
  const notes = e.notes ? `<div class="entry-notes">${esc(e.notes)}</div>` : "";

  return `<div class="entry">
    <div class="preview">${preview}</div>
    <table class="kv">${specRows}</table>
    ${notes}
  </div>`;
}

/**
 * Per-trade single-room PDF page. One bathroom per page, all that trade's
 * entries grouped, room summary at top. Designed for a sub to take to
 * the job site as a single reference sheet per bathroom.
 */
function tradeRoomPageHtml(
  room: Room,
  trade: TradeKind,
  imageByBrandSku: Map<string, string>,
): string {
  const entries = (room.entries_by_trade[trade] ?? []).slice().sort((a, b) => {
    const la = typeof a.location_in_room === "string" ? a.location_in_room : "";
    const lb = typeof b.location_in_room === "string" ? b.location_in_room : "";
    return (LOCATION_ORDER[la] ?? 999) - (LOCATION_ORDER[lb] ?? 999);
  });
  if (entries.length === 0) return "";

  // Summary chips: distinct brands, grout colors, surfaces
  const brands = new Set<string>();
  const grouts = new Set<string>();
  const surfaces = new Set<string>();
  for (const e of entries) {
    if (typeof e.brand === "string") brands.add(e.brand);
    if (typeof e.grout_color === "string" && e.grout_color) grouts.add(e.grout_color);
    if (typeof e.location_in_room === "string") surfaces.add(e.location_in_room.replace(/_/g, " "));
  }
  const chips = [
    ...Array.from(brands).map((b) => `<span class="chip brand">${esc(b)}</span>`),
    ...Array.from(grouts).map((g) => `<span class="chip grout">grout: ${esc(g)}</span>`),
  ].join(" ");

  return `<section class="room-page">
    <header class="room-header">
      <h2>${esc(room.room_name)}</h2>
      <div class="chips">${chips}</div>
      <div class="surfaces">${entries.length} ${trade} entries · surfaces: ${Array.from(surfaces).join(", ")}</div>
    </header>
    <div class="entries">${entries.map((e) => entryCardHtml(trade, e, imageByBrandSku)).join("")}</div>
  </section>`;
}

export function renderProjectHtml(opts: {
  project: Project;
  rooms: Room[];
  tradeFilter?: TradeKind;
  imageByBrandSku: Map<string, string>;
  generatedAt: Date;
}): string {
  const { project, rooms, tradeFilter, imageByBrandSku, generatedAt } = opts;
  const trades: TradeKind[] = tradeFilter ? [tradeFilter] : [...TRADE_KINDS];

  // Per-trade PDF: one bathroom per page, sub-friendly layout.
  if (tradeFilter) {
    const pages = rooms
      .map((room) => tradeRoomPageHtml(room, tradeFilter, imageByBrandSku))
      .filter(Boolean)
      .join("");
    return wrap({
      project,
      generatedAt,
      title: `${project.name} — ${tradeFilter} sheet`,
      subtitle: `Per-room ${tradeFilter} reference. One bathroom per page.`,
      body: pages || "<p><em>No entries for this trade.</em></p>",
      perRoomPaging: true,
    });
  }

  // Full project PDF: grouped by room with all trades within each room.
  const sections = rooms
    .map((room) => {
      const tradeBlocks = trades
        .map((trade) => {
          const entries = room.entries_by_trade[trade] ?? [];
          if (entries.length === 0) return "";
          return `<section class="trade-block">
            <h3>${esc(trade)}</h3>
            <div class="entries">${entries.map((e) => entryCardHtml(trade, e, imageByBrandSku)).join("")}</div>
          </section>`;
        })
        .filter(Boolean)
        .join("");
      if (!tradeBlocks) return "";
      return `<section class="room"><h2>${esc(room.room_name)}</h2>${tradeBlocks}</section>`;
    })
    .filter(Boolean)
    .join("");

  return wrap({
    project,
    generatedAt,
    title: project.name,
    subtitle: null,
    body: sections || "<p><em>No entries.</em></p>",
    perRoomPaging: false,
  });
}

function wrap(opts: {
  project: Project;
  generatedAt: Date;
  title: string;
  subtitle: string | null;
  body: string;
  perRoomPaging: boolean;
}): string {
  const { project, generatedAt, title, subtitle, body, perRoomPaging } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2328; margin: 0; padding: 24px 32px; }
  header.top { border-bottom: 2px solid #1f2328; padding-bottom: 12px; margin-bottom: 24px; }
  h1 { margin: 0 0 4px 0; font-size: 24px; }
  .meta { color: #57606a; font-size: 12px; }
  .room { margin-bottom: 28px; page-break-inside: avoid; }
  .room h2 { margin: 0 0 12px 0; font-size: 18px; background: #f6f8fa; padding: 6px 10px; border-left: 4px solid #0969da; }
  .trade-block { margin-bottom: 16px; }
  .trade-block h3 { margin: 4px 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #57606a; }
  .entries { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
  .entry { background: #fafbfc; border: 1px solid #d0d7de; border-radius: 6px; padding: 10px; page-break-inside: avoid; }
  .entry .preview { margin-bottom: 6px; }
  .entry .pattern-svg { width: 100%; max-height: 160px; display: block; }
  .entry .entry-thumb { width: 100%; max-height: 140px; object-fit: cover; border-radius: 4px; }
  .entry .paint-swatch { width: 100%; height: 40px; background: #eef0f3; border-radius: 4px; margin-bottom: 6px; }
  .entry-notes { margin-top: 6px; padding: 6px 8px; background: #fff8c5; border-left: 3px solid #d4a72c; font-size: 11px; line-height: 1.4; }
  table.kv { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.kv th { text-align: left; color: #57606a; font-weight: 500; padding: 2px 6px 2px 0; vertical-align: top; width: 90px; }
  table.kv td { padding: 2px 0; word-break: break-word; font-weight: 500; }

  /* Per-room paging (per-trade PDFs only) */
  ${perRoomPaging ? `.room-page { page-break-after: always; padding-top: 8px; }
  .room-page:last-child { page-break-after: auto; }
  .room-page header.room-header { background: #f6f8fa; padding: 10px 14px; border-left: 6px solid #0969da; margin-bottom: 12px; border-radius: 4px; }
  .room-page header.room-header h2 { margin: 0; font-size: 22px; }
  .room-page .chips { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
  .room-page .chip { display: inline-block; font-size: 10px; padding: 2px 6px; border-radius: 10px; background: white; border: 1px solid #d0d7de; }
  .room-page .chip.brand { background: #ddf4ff; border-color: #54aeff; }
  .room-page .chip.grout { background: #fff8c5; border-color: #d4a72c; }
  .room-page .surfaces { margin-top: 6px; font-size: 11px; color: #57606a; }
  .room-page .entries { grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .room-page .entry .pattern-svg { max-height: 220px; }` : ""}

  footer { margin-top: 32px; padding-top: 8px; border-top: 1px solid #d0d7de; color: #8c959f; font-size: 11px; }
</style>
</head>
<body>
<header class="top">
  <h1>${esc(title)}</h1>
  <div class="meta">${project.address ? esc(project.address) + " · " : ""}Generated ${generatedAt.toISOString().slice(0, 10)}${subtitle ? " · " + esc(subtitle) : ""}</div>
</header>
${body}
<footer>Todd Campbell Custom Homes — Finish Selections</footer>
</body>
</html>`;
}
