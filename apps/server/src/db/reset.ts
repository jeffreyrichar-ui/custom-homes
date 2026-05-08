import fs from "node:fs";
import { env, dialect } from "../env.js";
import { closeDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import { runSeed } from "./seed.js";

async function resetSqlite() {
  const filename = env.DATABASE_URL.replace(/^file:/, "");
  if (fs.existsSync(filename)) {
    fs.rmSync(filename);
    console.log(`removed ${filename}`);
  }
  await runMigrations();
  await runSeed();
}

async function resetPg() {
  // Postgres reset = drop+recreate schema. Safer to require manual confirmation.
  console.error(
    "Refusing to reset Postgres database. Drop the schema manually with `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` then run `pnpm db:migrate`.",
  );
  process.exit(1);
}

const main = dialect === "sqlite" ? resetSqlite : resetPg;
main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
