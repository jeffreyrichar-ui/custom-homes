import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "./client.js";
import { makeDbi } from "./dbi.js";
import { defaultLocalStorage, imageKey } from "../services/imageStorage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(__dirname, "../../../../seed/bath-tile");
const DEFAULT_IMG_DIR = path.join(SEED_DIR, "images");

type PromptRow = {
  cache_key: string;
  filename: string;
  brand: string;
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function contentTypeFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".avif") return "image/avif";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

async function main() {
  const imageDir = process.argv[2] ?? DEFAULT_IMG_DIR;
  if (!fs.existsSync(imageDir)) {
    console.error(`image directory not found: ${imageDir}`);
    console.error(`Drop generated images into ${DEFAULT_IMG_DIR}/ or pass a path as an argument.`);
    process.exit(1);
  }

  const promptsPath = path.join(SEED_DIR, "image-prompts.json");
  if (!fs.existsSync(promptsPath)) {
    console.error(`run pnpm db:dump-image-prompts first to produce ${promptsPath}`);
    process.exit(1);
  }
  const promptsFile = JSON.parse(fs.readFileSync(promptsPath, "utf-8")) as { prompts: PromptRow[] };
  const promptByFilename = new Map(promptsFile.prompts.map((p) => [p.filename.toLowerCase(), p]));

  // Also build a lookup by slug(brand)__slug(cache_key) so users don't have to match the exact extension
  const promptByStem = new Map<string, PromptRow>();
  for (const p of promptsFile.prompts) {
    const stem = p.filename.replace(/\.[^.]+$/, "").toLowerCase();
    promptByStem.set(stem, p);
  }

  const db = getDb();
  const dbi = makeDbi(db);
  const { storage } = defaultLocalStorage();

  const files = fs.readdirSync(imageDir).filter((f) => /\.(jpe?g|png|webp|avif|gif)$/i.test(f));
  if (files.length === 0) {
    console.error(`no image files in ${imageDir}`);
    process.exit(1);
  }

  let inserted = 0;
  let updated = 0;
  let unmatched = 0;
  let bytes = 0;

  for (const file of files) {
    const lower = file.toLowerCase();
    const stem = lower.replace(/\.[^.]+$/, "");
    const row = promptByFilename.get(lower) ?? promptByStem.get(stem);
    if (!row) {
      console.warn(`[skip] ${file} — no match in image-prompts.json`);
      unmatched += 1;
      continue;
    }
    const buf = fs.readFileSync(path.join(imageDir, file));
    bytes += buf.length;
    const url = await storage.put(imageKey(row.brand, row.cache_key), buf, contentTypeFor(file));

    const existing = await dbi.query<{ id: string }>(
      `SELECT id FROM manufacturer_images WHERE brand = $1 AND sku = $2 LIMIT 1`,
      [row.brand, row.cache_key],
    );
    if (existing[0]) {
      await dbi.exec(
        `UPDATE manufacturer_images SET image_url = $1, scraped_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [url, existing[0].id],
      );
      updated += 1;
    } else {
      await dbi.exec(
        `INSERT INTO manufacturer_images (id, brand, sku, image_url) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), row.brand, row.cache_key, url],
      );
      inserted += 1;
    }
    console.log(`  ${row.brand} / ${row.cache_key}  ←  ${file}  →  ${url}`);
  }

  console.log(`\n=== Image import summary ===`);
  console.log(`inserted: ${inserted}  updated: ${updated}  unmatched: ${unmatched}`);
  console.log(`bytes stored: ${(bytes / 1024 / 1024).toFixed(2)} MB`);

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
