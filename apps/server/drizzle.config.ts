import "dotenv/config";
import type { Config } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.sqlite";
const isSqlite =
  databaseUrl.startsWith("file:") || databaseUrl.endsWith(".sqlite");

const config: Config = isSqlite
  ? {
      schema: "./src/db/schema.sqlite.ts",
      out: "./src/db/migrations/sqlite",
      dialect: "sqlite",
      dbCredentials: { url: databaseUrl.replace(/^file:/, "") },
    }
  : {
      schema: "./src/db/schema.pg.ts",
      out: "./src/db/migrations/pg",
      dialect: "postgresql",
      dbCredentials: { url: databaseUrl },
    };

export default config;
