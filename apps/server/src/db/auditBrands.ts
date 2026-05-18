import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findScraper, registeredBrands } from "../services/scrapers/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(__dirname, "../../../../seed/bath-tile");

type TileEntry = {
  trade: string;
  brand: string;
  style?: string | null;
  color?: string | null;
  sku?: string | null;
};

type Project = {
  project: { name: string };
  rooms: Array<{ room_name: string; entries: TileEntry[] }>;
};

type BrandStats = {
  brand: string;
  entries: number;
  withSku: number;
  withoutSku: number;
  hasScraper: boolean;
  scraperName: string | null;
};

function main() {
  const files = fs
    .readdirSync(SEED_DIR)
    .filter((f) => f.endsWith(".json") && f !== "audit.json" && f !== "image-prompts.json");

  const byBrand = new Map<string, BrandStats>();
  let totalTile = 0;

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(SEED_DIR, file), "utf-8")) as Project;
    for (const room of raw.rooms) {
      for (const entry of room.entries) {
        if (entry.trade !== "tile") continue;
        totalTile += 1;
        const brand = (entry.brand ?? "Unknown").trim() || "Unknown";
        const scraper = findScraper(brand);
        const stats = byBrand.get(brand) ?? {
          brand,
          entries: 0,
          withSku: 0,
          withoutSku: 0,
          hasScraper: !!scraper,
          scraperName: scraper?.brand ?? null,
        };
        stats.entries += 1;
        if (entry.sku && entry.sku.trim()) stats.withSku += 1;
        else stats.withoutSku += 1;
        byBrand.set(brand, stats);
      }
    }
  }

  const rows = Array.from(byBrand.values()).sort((a, b) => b.entries - a.entries);
  const covered = rows.filter((r) => r.hasScraper).reduce((n, r) => n + r.entries, 0);
  const uncovered = totalTile - covered;
  const coveragePct = totalTile === 0 ? 0 : Math.round((covered / totalTile) * 100);

  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  const padR = (s: string, n: number) => s.padStart(n).slice(0, n);

  console.log("");
  console.log(`Bath-tile brand audit  ·  ${totalTile} entries across ${files.length} projects`);
  console.log("");
  console.log(
    pad("Brand", 22) +
      padR("Entries", 9) +
      padR("With SKU", 10) +
      padR("No SKU", 8) +
      "  Scraper",
  );
  console.log("─".repeat(70));
  for (const r of rows) {
    const mark = r.hasScraper ? "✓ " + (r.scraperName ?? "") : "—";
    console.log(
      pad(r.brand, 22) +
        padR(String(r.entries), 9) +
        padR(String(r.withSku), 10) +
        padR(String(r.withoutSku), 8) +
        "  " +
        mark,
    );
  }
  console.log("─".repeat(70));
  console.log("");
  console.log(`Scraper coverage: ${covered}/${totalTile} entries (${coveragePct}%)`);
  console.log(`Uncovered entries: ${uncovered}`);
  console.log(`Registered scrapers: ${registeredBrands().join(", ")}`);
  console.log("");
}

main();
