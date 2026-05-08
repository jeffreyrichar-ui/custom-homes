import Database from "better-sqlite3";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { Pool } from "pg";
import { env, dialect } from "../env.js";
import * as pgSchema from "./schema.pg.js";
import * as sqliteSchema from "./schema.sqlite.js";

export type AppDb =
  | {
      kind: "sqlite";
      client: Database.Database;
      drizzle: ReturnType<typeof drizzleSqlite<typeof sqliteSchema>>;
      schema: typeof sqliteSchema;
    }
  | {
      kind: "postgres";
      client: Pool;
      drizzle: ReturnType<typeof drizzlePg<typeof pgSchema>>;
      schema: typeof pgSchema;
    };

let cached: AppDb | null = null;

function sqliteFile(url: string): string {
  return url.replace(/^file:/, "");
}

export function getDb(): AppDb {
  if (cached) return cached;

  if (dialect === "sqlite") {
    const filename = sqliteFile(env.DATABASE_URL);
    const client = new Database(filename);
    client.pragma("journal_mode = WAL");
    client.pragma("foreign_keys = ON");
    const d = drizzleSqlite(client, { schema: sqliteSchema });
    cached = { kind: "sqlite", client, drizzle: d, schema: sqliteSchema };
  } else {
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    const d = drizzlePg(pool, { schema: pgSchema });
    cached = { kind: "postgres", client: pool, drizzle: d, schema: pgSchema };
  }

  return cached;
}

export async function closeDb(): Promise<void> {
  if (!cached) return;
  if (cached.kind === "sqlite") {
    cached.client.close();
  } else {
    await cached.client.end();
  }
  cached = null;
}
