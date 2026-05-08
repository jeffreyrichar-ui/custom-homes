import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  const db = getDb();
  if (db.kind === "sqlite") {
    const folder = path.join(__dirname, "migrations", "sqlite");
    migrateSqlite(db.drizzle, { migrationsFolder: folder });
  } else {
    const folder = path.join(__dirname, "migrations", "pg");
    await migratePg(db.drizzle, { migrationsFolder: folder });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => closeDb())
    .then(() => {
      console.log("migrations applied");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
