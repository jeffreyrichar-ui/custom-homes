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

function entryTable(trade: TradeKind, entries: Entry[], imageByBrandSku: Map<string, string>): string {
  if (entries.length === 0) return "";
  if (trade === "tile") {
    return entries
      .map((e) => {
        const brand = String(e.brand ?? "");
        const sku = String(e.sku ?? "");
        const url = imageByBrandSku.get(`${brand}|${sku}`) ?? null;
        const svg = renderPatternSvg({
          imageUrl: url,
          groutColor: String(e.grout_color ?? "") || null,
          pattern: String(e.pattern ?? "") || null,
          style: String(e.style ?? "") || null,
          color: String(e.color ?? "") || null,
          notes: String(e.notes ?? "") || null,
          cols: 5,
          rows: 4,
        });
        return `
          <div class="entry">
            <div class="preview">${svg}</div>
            <table class="kv">
              <tr><th>Brand</th><td>${esc(e.brand)}</td></tr>
              <tr><th>Style</th><td>${esc(e.style)}</td></tr>
              <tr><th>Color</th><td>${esc(e.color)}</td></tr>
              <tr><th>SKU</th><td>${esc(e.sku)}</td></tr>
              <tr><th>Pattern</th><td>${esc(e.pattern)}</td></tr>
              <tr><th>Edge profile</th><td>${esc(e.edge_profile)}</td></tr>
              <tr><th>Grout color</th><td>${esc(e.grout_color)}</td></tr>
              <tr><th>Grout SKU</th><td>${esc(e.grout_sku)}</td></tr>
              <tr><th>Location</th><td>${esc(e.location_in_room)}</td></tr>
              ${e.notes ? `<tr><th>Notes</th><td>${esc(e.notes)}</td></tr>` : ""}
            </table>
          </div>`;
      })
      .join("");
  }
  // Generic table for non-tile trades
  return entries
    .map((e) => {
      const brand = String(e.brand ?? "");
      const sku = String(e.sku ?? "");
      const url = imageByBrandSku.get(`${brand}|${sku}`) ?? null;
      const swatch =
        trade === "paint"
          ? `<div class="swatch"></div>`
          : url
            ? `<img class="entry-thumb" src="${esc(url)}"/>`
            : "";
      const rows = Object.entries(e)
        .filter(([k, v]) =>
          ![
            "id",
            "room_id",
            "created_at",
            "synced_at",
            "external_id",
            "external_source",
            "trade",
            "is_new_entry",
            "status",
            "allowance",
            "deadline",
            "image_url",
          ].includes(k) && v != null && v !== "",
        )
        .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
        .join("");
      return `<div class="entry">${swatch}<table class="kv">${rows}</table></div>`;
    })
    .join("");
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

  const sections = rooms
    .map((room) => {
      const tradeBlocks = trades
        .map((trade) => {
          const entries = room.entries_by_trade[trade] ?? [];
          if (entries.length === 0) return "";
          return `<section class="trade-block">
            <h3>${esc(trade)}</h3>
            <div class="entries">${entryTable(trade, entries, imageByBrandSku)}</div>
          </section>`;
        })
        .filter(Boolean)
        .join("");
      if (!tradeBlocks) return "";
      return `<section class="room"><h2>${esc(room.room_name)}</h2>${tradeBlocks}</section>`;
    })
    .filter(Boolean)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(project.name)}${tradeFilter ? ` — ${esc(tradeFilter)}` : ""}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2328; margin: 0; padding: 24px 32px; }
  header { border-bottom: 2px solid #1f2328; padding-bottom: 12px; margin-bottom: 24px; }
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
  .entry .swatch { width: 100%; height: 40px; background: #eef0f3; border-radius: 4px; margin-bottom: 6px; }
  table.kv { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.kv th { text-align: left; color: #57606a; font-weight: 500; padding: 2px 6px 2px 0; vertical-align: top; width: 90px; }
  table.kv td { padding: 2px 0; word-break: break-word; }
  footer { margin-top: 32px; padding-top: 8px; border-top: 1px solid #d0d7de; color: #8c959f; font-size: 11px; }
</style>
</head>
<body>
<header>
  <h1>${esc(project.name)}${tradeFilter ? ` — ${esc(tradeFilter)} sheet` : ""}</h1>
  <div class="meta">${project.address ? esc(project.address) + " · " : ""}Generated ${generatedAt.toISOString().slice(0, 10)}</div>
</header>
${sections || "<p><em>No entries.</em></p>"}
<footer>Todd Campbell Homes — Finish Selections</footer>
</body>
</html>`;
}
