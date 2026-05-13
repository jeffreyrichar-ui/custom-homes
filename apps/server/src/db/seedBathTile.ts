import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "./client.js";
import { makeDbi } from "./dbi.js";
import { runImport } from "../services/importer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Loads every JSON file in seed/bath-tile/ (repo root) via the importer.
 * Idempotent — re-running upserts rows in place. Reports per-project counts.
 */
async function main() {
  // seed/bath-tile/ lives at repo root: apps/server/src/db/seedBathTile.ts → ../../../../seed/bath-tile
  const seedDir = path.resolve(__dirname, "../../../../seed/bath-tile");
  if (!fs.existsSync(seedDir)) {
    console.error(`seed directory not found: ${seedDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(seedDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.error(`no JSON files in ${seedDir}`);
    process.exit(1);
  }

  const dbi = makeDbi(getDb());
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let projectsLoaded = 0;
  let projectsFailed = 0;

  for (const f of files) {
    const fullPath = path.join(seedDir, f);
    const raw = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as unknown;
    try {
      const result = await runImport(dbi, raw, { dryRun: false });
      const tileSummary = result.summary.tile_entries;
      if (result.errors.length > 0) {
        console.warn(`[${f}] ${result.errors.length} error(s):`);
        for (const e of result.errors.slice(0, 5)) {
          console.warn(`  - ${e.path}: ${e.message}`);
        }
        if (result.errors.length > 5) {
          console.warn(`  ...and ${result.errors.length - 5} more`);
        }
      }
      console.log(
        `[${f}] tiles: +${tileSummary.created} ~${tileSummary.updated} !${tileSummary.failed}` +
          ` | project_id=${result.project_id ?? "FAIL"}`,
      );
      totalCreated += tileSummary.created;
      totalUpdated += tileSummary.updated;
      totalFailed += tileSummary.failed;
      if (result.project_id) projectsLoaded += 1;
      else projectsFailed += 1;
    } catch (err) {
      console.error(`[${f}] FAILED:`, err);
      projectsFailed += 1;
    }
  }

  // Sanity check: how many distinct brands does the DB now have?
  const brandRows = await dbi.query<{ brand: string; n: number | string }>(
    `SELECT brand, COUNT(*) AS n FROM tile_entries GROUP BY brand ORDER BY n DESC`,
  );
  console.log("\n=== Tile brand distribution ===");
  for (const r of brandRows) {
    console.log(`  ${r.brand}: ${r.n}`);
  }

  console.log("\n=== Summary ===");
  console.log(`projects loaded: ${projectsLoaded}, failed: ${projectsFailed}`);
  console.log(`tile entries:    +${totalCreated}  ~${totalUpdated}  !${totalFailed}`);

  await closeDb();
  if (projectsFailed > 0 || totalFailed > 0) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
