#!/usr/bin/env tsx
/**
 * Normalize seed/bath-tile/*.json:
 *   - When brand is a known vendor (Masonry Center, Tile Shop), promote
 *     it to a new `vendor` field and try to extract the real manufacturer
 *     from the style prefix.
 *   - Rename Dal → Daltile, Marrazzi → Marazzi, Dal Spirit → Daltile +
 *     prepend "Spirit " to style.
 *
 * Rewrites every JSON file in place. Idempotent — re-running on already-
 * normalized data is a no-op because the vendor field is already set.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(__dirname, "../../../../seed/bath-tile");

type TileEntry = {
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

const VENDORS = new Set([
  "Masonry Center",
  "Tile Shop",
  "Great Floors",
  "Nampa Floors",
]);

/**
 * Manufacturer prefixes found in style strings (when brand is a vendor).
 * Order matters — longer/multi-word matches come first.
 */
const MANUFACTURER_PREFIXES: Array<{ re: RegExp; canonical: string }> = [
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

function normalizeEntry(entry: TileEntry): TileEntry {
  // Already normalized with a real manufacturer — skip
  if (
    entry.vendor !== undefined &&
    entry.vendor !== null &&
    entry.brand !== entry.vendor
  ) {
    return entry;
  }

  // Otherwise re-process: either fresh (no vendor) or stuck-at-vendor
  // (brand==vendor, manufacturer was previously unknown and may now be
  // identifiable via newly-added manufacturer prefixes).
  const out: TileEntry = { ...entry };

  // Case 1: brand is a vendor — promote and try to extract manufacturer
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
            out.notes = out.notes
              .replace(/\s*\|?\s*MANUFACTURER UNKNOWN: confirm with Tamara\s*/g, "")
              .replace(/^\s*\|\s*/, "")
              .trim() || null;
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

  // Case 2: Dal Spirit → Daltile, prepend "Spirit" to style
  if (out.brand === "Dal Spirit") {
    out.brand = "Daltile";
    out.style = out.style ? `Spirit ${out.style}` : "Spirit";
    out.vendor = null;
    return out;
  }

  // Case 3: brand renames
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

main();
