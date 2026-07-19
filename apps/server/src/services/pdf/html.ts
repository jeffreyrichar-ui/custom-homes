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

const BUILDER_NAME = process.env.BUILDER_NAME ?? "Todd Campbell Custom Homes";

function esc(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function prettyTrade(t: TradeKind): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const SPEC_FIELDS_BY_TRADE: Record<TradeKind, string[]> = {
  tile: ["brand", "style", "color", "sku", "grout_color", "grout_sku", "edge_profile", "pattern", "location_in_room", "vendor"],
  paint: ["brand", "color_name", "sku", "sheen", "surface_application"],
  carpet: ["brand", "style", "color", "sku", "pile"],
  hardwood: ["brand", "species", "color", "sku", "plank_width", "pattern"],
  cabinet: ["brand", "style", "color", "hardware"],
  countertop: ["material", "brand", "color", "edge_profile"],
};

// Fields that get pulled into the entry card "headline" rather than the spec
// table — these read better as a typographic hierarchy than as a kv row.
const HEADLINE_FIELDS_BY_TRADE: Record<TradeKind, { primary?: string; secondary?: string }> = {
  tile: { primary: "brand", secondary: "style" },
  paint: { primary: "brand", secondary: "color_name" },
  carpet: { primary: "brand", secondary: "style" },
  hardwood: { primary: "brand", secondary: "species" },
  cabinet: { primary: "brand", secondary: "style" },
  countertop: { primary: "brand", secondary: "material" },
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
  const headline = HEADLINE_FIELDS_BY_TRADE[trade] ?? {};

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

  // Pull primary/secondary out of the spec table so they appear in the header.
  const headlinePrimary = headline.primary ? String(e[headline.primary] ?? "") : "";
  const headlineSecondary = headline.secondary ? String(e[headline.secondary] ?? "") : "";
  const headlineFields = new Set(
    [headline.primary, headline.secondary].filter((k): k is string => Boolean(k)),
  );

  const headlineHtml = (headlinePrimary || headlineSecondary)
    ? `<div class="entry-headline">
        ${headlinePrimary ? `<div class="entry-headline-primary">${esc(headlinePrimary)}</div>` : ""}
        ${headlineSecondary ? `<div class="entry-headline-secondary">${esc(headlineSecondary)}</div>` : ""}
      </div>`
    : "";

  // Surface badge — e.g. "floor", "shower walls" — visible on tile entries.
  const loc = typeof e.location_in_room === "string" ? e.location_in_room : "";
  const surfaceBadge = loc
    ? `<div class="entry-surface">${esc(loc.replace(/_/g, " "))}</div>`
    : "";

  const specRows = fields
    .filter((k) => !headlineFields.has(k) && k !== "location_in_room" && e[k] != null && e[k] !== "")
    .map((k) => `<tr><th>${esc(k.replace(/_/g, " "))}</th><td>${esc(e[k])}</td></tr>`)
    .join("");
  const notes = e.notes ? `<div class="entry-notes">${esc(e.notes)}</div>` : "";

  return `<div class="entry">
    <div class="entry-body">
      ${surfaceBadge}
      ${headlineHtml}
      <table class="kv">${specRows}</table>
      ${notes}
    </div>
    <div class="preview">${preview}</div>
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

  return `<section class="room-page" id="room-${esc(room.id)}">
    <header class="room-header">
      <div class="room-eyebrow">${esc(prettyTrade(trade))} selections</div>
      <h2>${esc(room.room_name)}</h2>
      <div class="chips">${chips}</div>
      <div class="surfaces">${entries.length} ${trade} ${entries.length === 1 ? "entry" : "entries"} &middot; surfaces: ${esc(Array.from(surfaces).join(", "))}</div>
    </header>
    <div class="entries">${entries.map((e) => entryCardHtml(trade, e, imageByBrandSku)).join("")}</div>
  </section>`;
}

function coverPageHtml(opts: {
  project: Project;
  trades: TradeKind[];
  tradeFilter?: TradeKind;
  roomCount: number;
  entryCount: number;
  generatedAt: Date;
  subtitle: string | null;
  badgeLabel?: string;
}): string {
  const { project, tradeFilter, roomCount, entryCount, generatedAt, subtitle } = opts;
  const badge =
    opts.badgeLabel ??
    (tradeFilter ? `${prettyTrade(tradeFilter)} schedule` : "Full Selections");
  const summary = tradeFilter
    ? `${roomCount} ${roomCount === 1 ? "room" : "rooms"} &middot; ${entryCount} ${tradeFilter} ${entryCount === 1 ? "selection" : "selections"}`
    : `${roomCount} ${roomCount === 1 ? "room" : "rooms"} &middot; ${entryCount} ${entryCount === 1 ? "selection" : "selections"}`;
  return `<section class="cover">
    <div class="cover-top">
      <div class="cover-eyebrow">Finish Selections</div>
      <h1 class="cover-title">${esc(project.name)}</h1>
      ${project.address ? `<div class="cover-address">${esc(project.address)}</div>` : ""}
    </div>
    <div class="cover-mid">
      <div class="cover-rule"></div>
      <div class="cover-badge">${esc(badge)}</div>
      <div class="cover-rule"></div>
    </div>
    <div class="cover-bottom">
      <div class="cover-summary">${summary}</div>
      ${subtitle ? `<div class="cover-subtitle">${esc(subtitle)}</div>` : ""}
      <div class="cover-prepared">
        <div class="cover-prepared-label">Prepared for</div>
        <div class="cover-prepared-name">${esc(BUILDER_NAME)}</div>
      </div>
      <div class="cover-date">${esc(formatLongDate(generatedAt))}</div>
    </div>
  </section>`;
}

function tocHtml(rooms: Room[], trade: TradeKind): string {
  // Build TOC from rooms that actually have entries for this trade.
  const tocRooms = rooms.filter(
    (r) => (r.entries_by_trade[trade] ?? []).length > 0,
  );
  if (tocRooms.length < 2) return ""; // Only show TOC for multi-room PDFs.

  const rows = tocRooms
    .map((r) => {
      const count = (r.entries_by_trade[trade] ?? []).length;
      return `<li class="toc-row">
        <a class="toc-link" href="#room-${esc(r.id)}">
          <span class="toc-room">${esc(r.room_name)}</span>
          <span class="toc-dots"></span>
          <span class="toc-count">${count} ${count === 1 ? "entry" : "entries"}</span>
        </a>
      </li>`;
    })
    .join("");

  return `<section class="toc-page">
    <div class="toc-eyebrow">Contents</div>
    <h2 class="toc-title">Rooms in this document</h2>
    <ol class="toc-list">${rows}</ol>
  </section>`;
}

// Full-project sibling of tocHtml — same markup/classes, but counts span all
// trades and zero-entry rooms stay listed (muted) so the book shows the
// whole house.
function fullTocHtml(rooms: Room[]): string {
  if (rooms.length < 2) return ""; // Only show TOC for multi-room PDFs.

  const rows = rooms
    .map((r) => {
      const count = TRADE_KINDS.reduce(
        (acc, trade) => acc + (r.entries_by_trade[trade] ?? []).length,
        0,
      );
      const inner = `<span class="toc-room">${esc(r.room_name)}</span>
          <span class="toc-dots"></span>
          <span class="toc-count">${count} ${count === 1 ? "entry" : "entries"}</span>`;
      // Zero-entry rooms render no body section, so there is no anchor to
      // link to — show them muted and unlinked rather than as a dead link.
      return count === 0
        ? `<li class="toc-row muted"><span class="toc-link">${inner}</span></li>`
        : `<li class="toc-row">
        <a class="toc-link" href="#room-${esc(r.id)}">
          ${inner}
        </a>
      </li>`;
    })
    .join("");

  return `<section class="toc-page">
    <div class="toc-eyebrow">Contents</div>
    <h2 class="toc-title">Rooms in this document</h2>
    <ol class="toc-list">${rows}</ol>
  </section>`;
}

export function renderProjectHtml(opts: {
  project: Project;
  rooms: Room[];
  tradeFilter?: TradeKind;
  imageByBrandSku: Map<string, string>;
  generatedAt: Date;
  /** Cover badge override — the per-room PDF shows the room name. */
  badgeLabel?: string;
}): string {
  const { project, rooms, tradeFilter, imageByBrandSku, generatedAt } = opts;
  const trades: TradeKind[] = tradeFilter ? [tradeFilter] : [...TRADE_KINDS];

  // Per-trade PDF: one bathroom per page, sub-friendly layout.
  if (tradeFilter) {
    const populatedRooms = rooms.filter(
      (r) => (r.entries_by_trade[tradeFilter] ?? []).length > 0,
    );
    const entryCount = populatedRooms.reduce(
      (acc, r) => acc + (r.entries_by_trade[tradeFilter] ?? []).length,
      0,
    );
    const pages = rooms
      .map((room) => tradeRoomPageHtml(room, tradeFilter, imageByBrandSku))
      .filter(Boolean)
      .join("");
    const subtitle = `Per-room ${tradeFilter} reference. One bathroom per page.`;
    const cover = coverPageHtml({
      project,
      trades,
      tradeFilter,
      roomCount: populatedRooms.length,
      entryCount,
      generatedAt,
      subtitle,
    });
    const toc = tocHtml(rooms, tradeFilter);
    return wrap({
      title: `${project.name} — ${tradeFilter} sheet`,
      cover,
      toc,
      body: pages || "<p><em>No entries for this trade.</em></p>",
      perRoomPaging: true,
    });
  }

  // Full project PDF: grouped by room with all trades within each room.
  let totalEntries = 0;
  let populatedRoomCount = 0;
  const sections = rooms
    .map((room) => {
      const tradeBlocks = trades
        .map((trade) => {
          const entries = room.entries_by_trade[trade] ?? [];
          if (entries.length === 0) return "";
          totalEntries += entries.length;
          return `<section class="trade-block">
            <h3>${esc(trade)}</h3>
            <div class="entries">${entries.map((e) => entryCardHtml(trade, e, imageByBrandSku)).join("")}</div>
          </section>`;
        })
        .filter(Boolean)
        .join("");
      if (!tradeBlocks) return "";
      populatedRoomCount += 1;
      return `<section class="room"><a class="anchor" id="room-${esc(room.id)}"></a><h2>${esc(room.room_name)}</h2>${tradeBlocks}</section>`;
    })
    .filter(Boolean)
    .join("");

  const cover = coverPageHtml({
    project,
    trades,
    roomCount: populatedRoomCount,
    entryCount: totalEntries,
    generatedAt,
    subtitle: null,
    badgeLabel: opts.badgeLabel,
  });

  return wrap({
    title: project.name,
    cover,
    toc: fullTocHtml(rooms),
    body: sections || "<p><em>No entries.</em></p>",
    perRoomPaging: false,
  });
}

function wrap(opts: {
  title: string;
  cover: string;
  toc: string;
  body: string;
  perRoomPaging: boolean;
}): string {
  const { title, cover, toc, body, perRoomPaging } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>
  /* ============================================================
     Custom Homes — PDF design system
     Mirrors apps/web/src/styles.css tokens so the printed
     spec sheet feels like the same product Tamara uses on screen.
     ============================================================ */
  :root {
    --bg: #faf8f5;
    --surface: #ffffff;
    --surface-2: #f4f1ec;
    --border: #e5e0d8;
    --border-strong: #c9c0b1;
    --text: #1a1917;
    --text-2: #5c574e;
    --text-3: #8f897e;
    --primary: #6b5645;
    --warning: #a87f3e;
    --warning-soft: #fbf4e3;

    --font-serif: "Iowan Old Style", "Apple Garamond", Baskerville,
      "Times New Roman", "Source Serif Pro", serif;
    --font-sans: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI",
      Roboto, "Helvetica Neue", Arial, sans-serif;
  }

  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: white;
    color: var(--text);
    font-family: var(--font-sans);
    font-size: 11.5px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  body { padding: 24px 32px; }

  /* Serif headings, mirroring web app */
  h1, h2, h3, h4 {
    font-family: var(--font-serif);
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--text);
    margin: 0;
  }

  /* ----- Cover page ----- */
  .cover {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 9.2in;
    padding: 0.4in 0.2in;
    page-break-after: always;
  }
  .cover-top { padding-top: 0.6in; }
  .cover-eyebrow {
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--text-3);
    margin-bottom: 18px;
  }
  .cover-title {
    font-family: var(--font-serif);
    font-size: 52px;
    font-weight: 500;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--text);
    margin: 0 0 14px 0;
  }
  .cover-address {
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 18px;
    color: var(--text-2);
    line-height: 1.4;
  }
  .cover-mid {
    display: flex;
    align-items: center;
    gap: 18px;
    margin: 0 0 24px 0;
  }
  .cover-rule {
    flex: 1 1 auto;
    height: 1px;
    background: var(--text);
  }
  .cover-badge {
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--text);
    padding: 6px 14px;
    border: 1px solid var(--text);
    border-radius: 2px;
    flex: 0 0 auto;
  }
  .cover-bottom {
    border-top: 1px solid var(--border);
    padding-top: 24px;
    padding-bottom: 0.2in;
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    gap: 6px 24px;
    align-items: end;
  }
  .cover-summary {
    grid-column: 1 / -1;
    font-family: var(--font-sans);
    font-size: 13px;
    color: var(--text-2);
    letter-spacing: 0.02em;
    margin-bottom: 4px;
  }
  .cover-subtitle {
    grid-column: 1 / -1;
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 13px;
    color: var(--text-3);
    line-height: 1.5;
    margin-bottom: 10px;
  }
  .cover-prepared { grid-column: 1; }
  .cover-prepared-label {
    font-family: var(--font-sans);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--text-3);
    margin-bottom: 4px;
  }
  .cover-prepared-name {
    font-family: var(--font-serif);
    font-size: 20px;
    color: var(--text);
    letter-spacing: -0.01em;
  }
  .cover-date {
    grid-column: 2;
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    text-align: right;
  }

  /* ----- Mini TOC ----- */
  .toc-page {
    padding: 0.4in 0.2in 0.6in;
    page-break-after: always;
  }
  .toc-eyebrow {
    font-family: var(--font-sans);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--text-3);
    margin-bottom: 8px;
  }
  .toc-title {
    font-family: var(--font-serif);
    font-size: 30px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--text);
    margin: 0 0 28px 0;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--text);
  }
  .toc-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .toc-row {
    margin: 0;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .toc-link {
    display: flex;
    align-items: baseline;
    gap: 10px;
    color: var(--text);
    text-decoration: none;
    font-family: var(--font-sans);
    font-size: 14px;
  }
  .toc-room {
    font-family: var(--font-serif);
    font-size: 17px;
    color: var(--text);
    letter-spacing: -0.005em;
    flex: 0 0 auto;
  }
  .toc-dots {
    flex: 1 1 auto;
    border-bottom: 1px dotted var(--border-strong);
    height: 0;
    transform: translateY(-3px);
  }
  .toc-count {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--text-3);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  /* Zero-entry rooms in the full-project TOC: listed but muted. */
  .toc-row.muted .toc-room,
  .toc-row.muted .toc-count {
    color: var(--text-3);
  }
  .toc-row.muted .toc-room {
    font-style: italic;
  }

  /* ----- Full-project layout ----- */
  .room {
    margin: 0 0 28px 0;
    page-break-inside: avoid;
  }
  .room h2 {
    font-family: var(--font-serif);
    font-size: 22px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--text);
    margin: 0 0 14px 0;
    padding: 0 0 10px 0;
    border-bottom: 1px solid var(--text);
  }
  .trade-block { margin-bottom: 18px; page-break-inside: avoid; }
  .trade-block h3 {
    font-family: var(--font-sans);
    margin: 8px 0 10px 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-3);
  }

  /* ----- Entry cards ----- */
  .entries {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .entry {
    display: grid;
    grid-template-columns: 1fr 170px;
    gap: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 16px;
    page-break-inside: avoid;
  }
  .entry-body { min-width: 0; }
  .entry-surface {
    display: inline-block;
    font-family: var(--font-sans);
    font-size: 9.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--text-2);
    background: var(--surface-2);
    padding: 3px 8px;
    border-radius: 10px;
    margin-bottom: 8px;
  }
  .entry-headline { margin-bottom: 10px; }
  .entry-headline-primary {
    font-family: var(--font-serif);
    font-size: 18px;
    font-weight: 500;
    letter-spacing: -0.005em;
    color: var(--text);
    line-height: 1.2;
  }
  .entry-headline-secondary {
    font-family: var(--font-serif);
    font-size: 14px;
    font-style: italic;
    color: var(--text-2);
    margin-top: 2px;
    line-height: 1.3;
  }
  .entry .preview {
    align-self: start;
  }
  .entry .pattern-svg {
    width: 100%;
    max-height: 170px;
    display: block;
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .entry .entry-thumb {
    width: 100%;
    max-height: 160px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid var(--border);
  }
  .entry .paint-swatch {
    width: 100%;
    height: 80px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .entry-notes {
    margin-top: 10px;
    padding: 7px 10px;
    background: var(--warning-soft);
    border-left: 3px solid var(--warning);
    border-radius: 2px;
    font-family: var(--font-sans);
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--text);
    font-style: italic;
  }

  /* ----- Spec table (kv) ----- */
  table.kv {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-sans);
    font-size: 10.5px;
    line-height: 1.5;
  }
  table.kv th {
    text-align: left;
    color: var(--text-3);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 9.5px;
    padding: 3px 10px 3px 0;
    vertical-align: top;
    width: 92px;
    white-space: nowrap;
  }
  table.kv td {
    padding: 3px 0;
    word-break: break-word;
    color: var(--text);
    font-weight: 500;
  }

  /* ----- Per-trade per-room page (room-page) ----- */
  ${perRoomPaging ? `
  .room-page {
    padding-top: 4px;
    page-break-after: always;
    page-break-inside: auto;
  }
  .room-page:last-child { page-break-after: auto; }
  .room-page header.room-header {
    margin-bottom: 18px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--text);
  }
  .room-page header.room-header .room-eyebrow {
    font-family: var(--font-sans);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--text-3);
    margin-bottom: 4px;
  }
  .room-page header.room-header h2 {
    margin: 0 0 8px 0;
    font-family: var(--font-serif);
    font-size: 28px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--text);
  }
  .room-page .chips {
    margin-top: 4px;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .room-page .chip {
    display: inline-block;
    font-family: var(--font-sans);
    font-size: 9.5px;
    font-weight: 500;
    padding: 2px 9px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    color: var(--text-2);
    letter-spacing: 0.02em;
  }
  .room-page .chip.brand {
    background: var(--surface-2);
    border-color: var(--border-strong);
    color: var(--text);
  }
  .room-page .chip.grout {
    background: var(--warning-soft);
    border-color: var(--warning);
    color: var(--warning);
  }
  .room-page .surfaces {
    margin-top: 8px;
    font-family: var(--font-sans);
    font-size: 10.5px;
    color: var(--text-3);
    letter-spacing: 0.02em;
  }
  .room-page .entries {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .room-page .entry {
    grid-template-columns: 1fr 200px;
    gap: 20px;
    padding: 16px 18px;
  }
  .room-page .entry .pattern-svg { max-height: 200px; }
  ` : ""}
</style>
</head>
<body>
${cover}
${toc}
<main>${body}</main>
</body>
</html>`;
}
