import cors from "cors";
import express from "express";
import morgan from "morgan";
import { env } from "./env.js";
import { closeDb, getDb } from "./db/client.js";
import { makeDbi } from "./db/dbi.js";
import { runMigrations } from "./db/migrate.js";
import { healthRouter } from "./routes/health.js";
import { makeProjectsRouter } from "./routes/projects.js";
import { makeAdminImportRouter } from "./routes/adminImport.js";
import { makeSuggestRouter } from "./routes/suggest.js";
import { makeSelectionsRouter } from "./routes/selections.js";
import { makeManufacturerImagesRouter } from "./routes/manufacturerImages.js";
import { defaultLocalStorage } from "./services/imageStorage.js";
import { makeScrapeQueue } from "./services/scrapeQueue.js";

export async function buildApp() {
  const db = getDb();
  const dbi = makeDbi(db);
  const getDbi = () => dbi;

  const { storage, serveDir, publicPrefix } = defaultLocalStorage();
  const scrapeQueue = makeScrapeQueue(getDbi, storage);

  const app = express();
  app.use(cors({ origin: env.WEB_ORIGIN }));
  app.use(express.json({ limit: "10mb" }));
  if (env.NODE_ENV !== "test") {
    app.use(morgan("dev"));
  }

  app.use(publicPrefix, express.static(serveDir));

  app.use("/api/health", healthRouter);
  app.use("/api/projects", makeProjectsRouter(getDbi));
  app.use("/api/admin", makeAdminImportRouter(getDbi));
  app.use("/api/suggest", makeSuggestRouter(getDbi));
  app.use("/api/selections", makeSelectionsRouter(getDbi, scrapeQueue));
  app.use("/api/manufacturer-images", makeManufacturerImagesRouter(getDbi, storage, scrapeQueue));

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: `not found: ${req.method} ${req.path}` });
  });

  // Error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(err);
      res.status(500).json({ error: err.message ?? "internal error" });
    },
  );

  return app;
}

async function main() {
  if (env.NODE_ENV !== "production") {
    await runMigrations();
  }
  const app = await buildApp();
  const server = app.listen(env.PORT, () => {
    console.log(
      `[server] listening on :${env.PORT} (db=${getDb().kind}, env=${env.NODE_ENV})`,
    );
  });

  const shutdown = async () => {
    server.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
