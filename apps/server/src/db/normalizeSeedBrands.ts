#!/usr/bin/env tsx
/**
 * Normalize seed/bath-tile/*.json:
 *   - When brand is a known vendor (Masonry Center, Tile Shop), promote
 *     it to a new `vendor` field and try to extract the real manufacturer
 *     from the style prefix.
 *   - Rename Dal → Daltile, Marrazzi → Marazzi, Dal Spirit → Daltile +
 *     prepend "Spirit " to style.
 *   - When brand is "Unknown" (legacy from the 2026-05-18 hand-edit pass),
 *     try to recover the canonical manufacturer via:
 *       * STYLE_BRAND_HINTS — exact style-name match
 *       * COLOR_BRAND_HINTS — color-only match for style-less entries
 *       * vendor-restore — entries with `MANUFACTURER UNKNOWN` in notes get
 *         brand reset to vendor=Masonry Center so the distribution
 *         reflects what we actually know
 *
 * Rewrites every JSON file in place. Idempotent — re-running on already-
 * normalized data is a no-op.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(__dirname, "../../../../seed/bath-tile");

export type TileEntry = {
  trade: "tile";
  vendor?: string | null;
  brand: string;
  style?: string | null;
  color?: string | null;
  sku?: string | null;
  grout_color?: string | null;
  grout_sku?: string | null;
  edge_profile?: string | null;
  pattern?: string | null;
  location_in_room: string;
  notes?: string | null;
};
type Room = { room_name: string; entries: TileEntry[] };
type Project = { rooms: Room[]; [k: string]: unknown };

export const VENDORS = new Set([
  "Masonry Center",
  "Tile Shop",
  "Great Floors",
  "Nampa Floors",
]);

/**
 * Manufacturer prefixes found in style strings (when brand is a vendor).
 * Order matters — longer/multi-word matches come first.
 */
export const MANUFACTURER_PREFIXES: Array<{ re: RegExp; canonical: string }> = [
  { re: /^Conrad Brick\b/i, canonical: "Conrad Brick" },
  { re: /^Highland Lake\b/i, canonical: "Highland Lake" },
  { re: /^Sand and Stone\b/i, canonical: "Daltile" },
  { re: /^Studio Haven\b|^A Studio Haven\b/i, canonical: "AO" },
  { re: /^Marrazi\b|^Marrazzi\b|^Marazzi\b/i, canonical: "Marazzi" },
  { re: /^Portabello\b|^Portobello\b/i, canonical: "Portobello" },
  { re: /^Lungarno\b/i, canonical: "Lungarno" },
  { re: /^Maniscalco\b/i, canonical: "Maniscalco" },
  { re: /^Coronado\b/i, canonical: "Coronado" },
  { re: /^El Dorado\b/i, canonical: "El Dorado" },
  { re: /^Ridgestone\b/i, canonical: "Ridgestone" },
  { re: /^Ragnos?\b/i, canonical: "Ragno" },
  { re: /^Marin\b|^Magnifico?a?\b|^Sahara\b|^Chroma\b|^Cloe\b|^Thaddeus\b|^Frammente\b|^Purestone\b/i, canonical: "Bedrosians" },
  { re: /^Hustle\b/i, canonical: "Hustle" },
  { re: /^Glace\b/i, canonical: "Glace" },
  { re: /^Cepac\b/i, canonical: "Cepac" },
  { re: /^MSI\b/i, canonical: "MSI" },
  { re: /^AO\b/, canonical: "AO" },
  { re: /^Sami\b/i, canonical: "Sami" },
  { re: /^Costa Clara\b/i, canonical: "Costa Clara" },
  { re: /^Chameleon\b/i, canonical: "Chameleon" },
  // Confirmed via WebSearch 2026-05:
  { re: /^Persuade\b/i, canonical: "Marazzi" },
  { re: /^Borghini Classico\b/i, canonical: "Portobello" },
  { re: /^Rhyme and Reason\b/i, canonical: "Marazzi" },
  { re: /^Zellige Neo\b/i, canonical: "Marazzi" },
  { re: /^Pompei\b/i, canonical: "Marazzi" },
  { re: /^Belvedere\b/i, canonical: "Marble Systems" },
  { re: /^Cassero\b/i, canonical: "Emser" },
];

/**
 * Style-name → canonical brand mapping used when an entry was previously
 * stuck at brand="Unknown" because the original raw brand was a vendor
 * (Masonry Center) and the style didn't match a MANUFACTURER_PREFIXES
 * regex. Each entry here is a high-confidence resolution backed by
 * either in-corpus evidence or WebSearch.
 *
 * Rewrites the entry to: brand=canonical, style=rewriteStyle (if set),
 * color/sku adjusted per `apply`, and clears the MANUFACTURER UNKNOWN
 * note flag.
 */
export type UnknownStyleResolution = {
  /** Match the exact style string (case-insensitive). */
  style: string;
  /** Canonical manufacturer brand. */
  brand: string;
  /** Replace style with this if set (else keep original). */
  rewriteStyle?: string;
  /** Move original style into this field (color/sku) if set. */
  preserveStyleAs?: "color" | "sku";
  /** Optional source label appended to notes. */
  source?: string;
};
export const STYLE_BRAND_HINTS: UnknownStyleResolution[] = [
  // Lana ZL 07: the sibling shower-wall entry in the same room is
  // Marazzi Zellige Neo with note "lower 7 ft ZL07 Lana, top 3 ft ZL11
  // Gesso". "ZL" is the Zellige Neo collection prefix. (See
  // centerra-8-2-adamson Media Room Bath.)
  {
    style: "Lana ZL 07",
    brand: "Marazzi",
    rewriteStyle: "Zellige Neo",
    preserveStyleAs: "color",
    source: "Marazzi Zellige Neo (ZL series); resolved from sibling shower-wall entry",
  },
];

/**
 * Color-only → canonical brand mapping. Used when both brand and style
 * are null/empty and only the color identifies the product. Each entry
 * must be high-confidence (backed by in-corpus SKU evidence).
 */
export type UnknownColorResolution = {
  color: string;
  brand: string;
  /** Style to set on the entry (must be the collection name). */
  style: string;
  /** Set sku to the original color value as well. */
  copyColorToSku?: boolean;
  source?: string;
};
export const COLOR_BRAND_HINTS: UnknownColorResolution[] = [
  // Rolling Fog: kingswood-4-2-savannah-rv has an Emser Visconde tub
  // entry with `sku: "Rolling Fog"`. The audit explicitly says "Rolling
  // Fog appears elsewhere with Emser/Visconde as the source." Both
  // null-style/color=Rolling Fog tub-surround entries (12x24) match.
  {
    color: "Rolling Fog",
    brand: "Emser",
    style: "Visconde",
    copyColorToSku: true,
    source: "Emser Visconde (Rolling Fog SKU); resolved from kingswood-4-2 sibling",
  },
];

function stripUnknownMarker(notes: string | null | undefined): string | null {
  if (!notes) return null;
  return (
    notes
      .replace(/\s*\|?\s*MANUFACTURER UNKNOWN: confirm with Tamara\s*/g, "")
      .replace(/^\s*\|\s*/, "")
      .replace(/AMBIGUOUS: portal listed [^.]*\.\s*/g, "")
      .replace(/Confirm brand with Tamara\.?\s*/g, "")
      .trim() || null
  );
}

function appendSource(notes: string | null | undefined, source: string | undefined): string | null {
  const base = (notes ?? "").trim();
  if (!source) return base || null;
  const tag = `RESOLVED: ${source}`;
  if (base.includes(tag)) return base;
  return base ? `${base} | ${tag}` : tag;
}

export function normalizeEntry(entry: TileEntry): TileEntry {
  // Already normalized with a real manufacturer — skip.
  if (
    entry.vendor !== undefined &&
    entry.vendor !== null &&
    entry.brand !== entry.vendor &&
    entry.brand !== "Unknown"
  ) {
    return entry;
  }

  const out: TileEntry = { ...entry };

  // Case 0: brand="Unknown" — recover via style/color hints, else restore
  // brand to the recorded vendor (if any) or leave as Unknown.
  if (out.brand === "Unknown") {
    const styleKey = (out.style ?? "").trim();
    if (styleKey) {
      for (const hint of STYLE_BRAND_HINTS) {
        if (hint.style.toLowerCase() === styleKey.toLowerCase()) {
          out.brand = hint.brand;
          const originalStyle = out.style;
          if (hint.rewriteStyle) out.style = hint.rewriteStyle;
          if (hint.preserveStyleAs === "color" && !out.color && originalStyle) {
            out.color = originalStyle;
          } else if (hint.preserveStyleAs === "sku" && !out.sku && originalStyle) {
            out.sku = originalStyle;
          }
          out.notes = appendSource(stripUnknownMarker(out.notes), hint.source);
          return out;
        }
      }
    }
    const colorKey = (out.color ?? "").trim();
    if (!styleKey && colorKey) {
      for (const hint of COLOR_BRAND_HINTS) {
        if (hint.color.toLowerCase() === colorKey.toLowerCase()) {
          out.brand = hint.brand;
          out.style = hint.style;
          if (hint.copyColorToSku && !out.sku) out.sku = colorKey;
          out.notes = appendSource(stripUnknownMarker(out.notes), hint.source);
          return out;
        }
      }
    }
    // No hint matched. If we know the vendor, surface that by setting
    // brand=vendor so the distribution reflects "we know the supplier,
    // not the manufacturer" rather than the opaque "Unknown".
    if (out.vendor) {
      out.brand = out.vendor;
      const note = out.notes ?? "";
      if (!note.includes("MANUFACTURER UNKNOWN")) {
        out.notes = note
          ? `${note} | MANUFACTURER UNKNOWN: confirm with Tamara`
          : "MANUFACTURER UNKNOWN: confirm with Tamara";
      }
      return out;
    }
    // Truly nothing known — leave as Unknown.
    return out;
  }

  // Case 1: brand is a vendor — promote and try to extract manufacturer.
  if (VENDORS.has(out.brand)) {
    const vendor = out.brand;
    out.vendor = vendor;
    if (out.style) {
      for (const { re, canonical } of MANUFACTURER_PREFIXES) {
        if (re.test(out.style)) {
          out.brand = canonical;
          const stripped = out.style.replace(re, "").trim().replace(/^[\/\s-]+|[\/\s-]+$/g, "");
          out.style = stripped || null;
          // Clean up the MANUFACTURER UNKNOWN flag if it's now identified.
          if (out.notes) {
            out.notes = stripUnknownMarker(out.notes);
          }
          return out;
        }
      }
    }
    // Could not identify manufacturer — leave brand as the vendor name
    // so the entry is still findable. Mark with a note.
    out.brand = vendor;
    const note = out.notes ?? "";
    if (!note.includes("MANUFACTURER UNKNOWN")) {
      out.notes = note ? `${note} | MANUFACTURER UNKNOWN: confirm with Tamara` : "MANUFACTURER UNKNOWN: confirm with Tamara";
    }
    return out;
  }

  // Case 2: Dal Spirit → Daltile, prepend "Spirit" to style.
  if (out.brand === "Dal Spirit") {
    out.brand = "Daltile";
    out.style = out.style ? `Spirit ${out.style}` : "Spirit";
    out.vendor = null;
    return out;
  }

  // Case 3: brand renames.
  const BRAND_RENAMES: Record<string, string> = {
    "Dal": "Daltile",
    "Marrazzi": "Marazzi",
    "Marrazi": "Marazzi",
  };
  if (BRAND_RENAMES[out.brand]) {
    out.brand = BRAND_RENAMES[out.brand]!;
  }
  out.vendor = null;
  return out;
}

function main() {
  const files = fs
    .readdirSync(SEED_DIR)
    .filter((f) => f.endsWith(".json") && f !== "audit.json" && f !== "image-prompts.json");

  let projectsTouched = 0;
  let entriesNormalized = 0;
  let manufacturersIdentified = 0;
  let manufacturersUnknown = 0;

  for (const file of files) {
    const fullPath = path.join(SEED_DIR, file);
    const project = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as Project;
    let changed = false;

    for (const room of project.rooms) {
      const newEntries: TileEntry[] = [];
      for (const entry of room.entries) {
        if (entry.trade !== "tile") {
          newEntries.push(entry);
          continue;
        }
        const before = JSON.stringify(entry);
        const normalized = normalizeEntry(entry);
        const after = JSON.stringify(normalized);
        if (before !== after) {
          changed = true;
          entriesNormalized += 1;
          if (normalized.vendor && normalized.brand !== normalized.vendor) {
            manufacturersIdentified += 1;
          } else if (normalized.vendor && normalized.brand === normalized.vendor) {
            manufacturersUnknown += 1;
          }
        }
        newEntries.push(normalized);
      }
      room.entries = newEntries;
    }

    if (changed) {
      fs.writeFileSync(fullPath, JSON.stringify(project, null, 2) + "\n");
      projectsTouched += 1;
      console.log(`[${file}] normalized`);
    } else {
      console.log(`[${file}] no changes`);
    }
  }

  console.log(`\n=== Normalization summary ===`);
  console.log(`projects touched: ${projectsTouched}`);
  console.log(`entries normalized: ${entriesNormalized}`);
  console.log(`manufacturers identified (vendor + brand split): ${manufacturersIdentified}`);
  console.log(`manufacturer unknown (vendor only, needs human review): ${manufacturersUnknown}`);
}

// Only run main() when executed directly (not when imported in tests).
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main();
}
