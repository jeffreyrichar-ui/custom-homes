import { exampleProject } from "@custom-homes/shared";
import { closeDb, getDb } from "./client.js";
import { makeDbi } from "./dbi.js";
import { runImport } from "../services/importer.js";

export async function runSeed(): Promise<void> {
  const db = getDb();
  const dbi = makeDbi(db);
  const result = await runImport(dbi, exampleProject, { dryRun: false });
  if (result.errors.length > 0) {
    console.error("seed completed with errors:", result.errors);
  }
  console.log(`seeded project ${result.project_id}`);
  console.log(JSON.stringify(result.summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSeed()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
