import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(__dirname, "../../../../seed/bath-tile");

type TileEntry = {
  trade: "tile";
  brand: string;
  style?: string | null;
  color?: string | null;
  sku?: string | null;
  grout_color?: string | null;
  edge_profile?: string | null;
  pattern?: string | null;
  location_in_room: string;
  notes?: string | null;
};

type Project = {
  project: { name: string };
  rooms: Array<{ room_name: string; entries: TileEntry[] }>;
};

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Stable 6-char hash for SKU-less tiles, derived from style+color. */
function syntheticKey(brand: string, style: string | null, color: string | null): string {
  const fingerprint = [brand, style ?? "", color ?? ""].join("|").toLowerCase();
  return crypto.createHash("sha1").update(fingerprint).digest("hex").slice(0, 6);
}

/** The canonical cache key — exact SKU if available, else AUTO-<hash>. */
function cacheKey(entry: TileEntry): string {
  if (entry.sku && entry.sku.trim()) return entry.sku.trim();
  return `AUTO-${syntheticKey(entry.brand, entry.style ?? null, entry.color ?? null)}`;
}

function buildPrompt(entry: TileEntry): string {
  const parts: string[] = [];
  parts.push("Single tile product photograph, top-down view, neutral studio lighting, pure white background, ecommerce listing style, photorealistic.");
  parts.push(`Tile brand: ${entry.brand}.`);
  if (entry.style) parts.push(`Style/collection: ${entry.style}.`);
  if (entry.color) parts.push(`Color: ${entry.color}.`);

  // Surface finish hints
  const finishHint =
    entry.color && /matte/i.test(entry.color)
      ? "matte finish, low sheen, soft micro-texture."
      : entry.color && /(polish|gloss)/i.test(entry.color)
        ? "polished glossy finish, reflective surface."
        : entry.color && /satin/i.test(entry.color)
          ? "satin finish, smooth, very low sheen."
          : "natural ceramic finish, slight surface variation.";
  parts.push(finishHint);

  // Shape hint from notes (size info lives there)
  const sizeMatch = entry.notes?.match(/(\d+\s*(?:x|×)\s*\d+(?:\s*(?:in|inch|\"))?)/i);
  if (sizeMatch) {
    parts.push(`Approximate size: ${sizeMatch[1]} inches.`);
  } else if (entry.notes && /penny\s*round/i.test(entry.notes)) {
    parts.push("Penny round mosaic on mesh-mount sheet — show one square sheet, tiles ~1 inch round.");
  } else if (entry.notes && /mosaic|palladiana/i.test(entry.notes)) {
    parts.push("Mosaic sheet, mixed small pieces.");
  } else if (entry.notes && /fluted/i.test(entry.notes)) {
    parts.push("Fluted surface — vertical ridges across the tile face.");
  } else {
    parts.push("Standard rectangular tile, no overlaid pattern (pattern is for layout, not surface).");
  }

  parts.push("Output: 1024x1024, centered, no human hands, no text or watermarks.");

  return parts.join(" ");
}

type PromptRow = {
  cache_key: string;
  filename: string;
  brand: string;
  style: string | null;
  color: string | null;
  sku: string | null;
  prompt: string;
  instances: number;
  used_in: string[]; // e.g. "Henderson Residence — Master Bath — shower_walls"
};

function main() {
  const files = fs.readdirSync(SEED_DIR).filter((f) => f.endsWith(".json") && f !== "audit.json" && f !== "image-prompts.json");

  const byKey = new Map<string, PromptRow>();

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(SEED_DIR, file), "utf-8")) as Project;
    for (const room of raw.rooms) {
      for (const entry of room.entries) {
        if (entry.trade !== "tile") continue;
        const key = cacheKey(entry);
        const filename = `${slug(entry.brand)}__${slug(key)}.jpg`;
        const usage = `${raw.project.name} — ${room.room_name} — ${entry.location_in_room}`;
        const existing = byKey.get(key);
        if (existing) {
          existing.instances += 1;
          if (!existing.used_in.includes(usage)) existing.used_in.push(usage);
        } else {
          byKey.set(key, {
            cache_key: key,
            filename,
            brand: entry.brand,
            style: entry.style ?? null,
            color: entry.color ?? null,
            sku: entry.sku ?? null,
            prompt: buildPrompt(entry),
            instances: 1,
            used_in: [usage],
          });
        }
      }
    }
  }

  const rows = Array.from(byKey.values()).sort((a, b) => b.instances - a.instances);
  const out = {
    generated_at: new Date().toISOString(),
    total_unique_tiles: rows.length,
    total_instances: rows.reduce((s, r) => s + r.instances, 0),
    image_directory: "seed/bath-tile/images/",
    filename_format: "<brand-slug>__<cache-key-slug>.jpg (cache key = real SKU when present, otherwise AUTO-<hash>)",
    importer_command: "pnpm db:import-tile-images",
    prompts: rows,
  };

  const outPath = path.join(SEED_DIR, "image-prompts.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${rows.length} unique tile prompts to ${outPath}`);
  console.log(`Top 5 by instance count:`);
  for (const r of rows.slice(0, 5)) {
    console.log(`  ${r.instances}×  ${r.brand} / ${r.style ?? "—"} / ${r.color ?? "—"}  →  ${r.filename}`);
  }
}

main();
