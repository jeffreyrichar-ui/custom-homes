import cookieParser from "cookie-parser";
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
import { makeStatsRouter } from "./routes/stats.js";
import { makeSelectionsRouter } from "./routes/selections.js";
import { makeManufacturerImagesRouter } from "./routes/manufacturerImages.js";
import { makePdfsRouter, pdfServeConfig } from "./routes/pdfs.js";
import { makeAuthRouter } from "./routes/auth.js";
import { makeAuthMiddleware } from "./middleware/auth.js";
import { defaultLocalStorage } from "./services/imageStorage.js";
import { makeScrapeQueue } from "./services/scrapeQueue.js";
import { closePdfBrowser } from "./services/pdf/generate.js";

export async function buildApp() {
  const db = getDb();
  const dbi = makeDbi(db);
  const getDbi = () => dbi;

  const { storage, serveDir, publicPrefix } = defaultLocalStorage();
  const scrapeQueue = makeScrapeQueue(getDbi, storage);
  const authMiddleware = makeAuthMiddleware(getDbi);

  const app = express();
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "10mb" }));
  app.use(cookieParser());
  if (env.NODE_ENV !== "test") {
    app.use(morgan("dev"));
  }

  app.use(publicPrefix, express.static(serveDir));
  const pdfCfg = pdfServeConfig();
  app.use(pdfCfg.prefix, express.static(pdfCfg.dir));

  // Public endpoints
  app.use("/api/health", healthRouter);
  app.use("/api/auth", makeAuthRouter(getDbi));

  // Read-only endpoints: open (selections form + admin import call /api/projects)
  app.use("/api/projects", makeProjectsRouter(getDbi));
  app.use("/api/suggest", makeSuggestRouter(getDbi));
  app.use("/api/stats", makeStatsRouter(getDbi));

  // Auth-gated write endpoints (replaces former x-admin-token; legacy token still accepted)
  app.use("/api/admin", authMiddleware, makeAdminImportRouter(getDbi));
  app.use("/api/selections", authMiddleware, makeSelectionsRouter(getDbi, scrapeQueue));
  app.use(
    "/api/manufacturer-images",
    makeManufacturerImagesRouter(getDbi, storage, scrapeQueue, authMiddleware),
  );
  app.use("/api/pdfs", authMiddleware, makePdfsRouter(getDbi));

  // /api/auth/me needs the middleware to populate req.user
  app.get("/api/auth/check", authMiddleware, (req, res) => {
    res.json({ user: req.user });
  });

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
    await closePdfBrowser().catch(() => {});
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
