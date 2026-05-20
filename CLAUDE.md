# CLAUDE.md

Operational guide for Claude sessions working in this repo. Terse on purpose.

## Project

Finish-selections web app that replaces designer Tamara's spreadsheets at Todd Campbell Custom Homes. It structures finish selections (tile, paint, carpet, hardwood, cabinets, countertops) per room per project, generates printable PDFs by trade and by room, and includes an admin JSON import path for backfilling historical projects. POC scope: bath/shower tile is rock-solid first; other trades follow the same shape.

## Architecture

- `apps/server` — Express + Drizzle ORM (Node 20, ESM, tsx in dev). Dual schema files `src/db/schema.pg.ts` + `src/db/schema.sqlite.ts` support PostgreSQL (prod) and SQLite (dev); cross-dialect queries route through `src/db/dbi.ts`. Routes in `src/routes/` (adminImport, auth, projects, selections, suggest, pdfs, manufacturerImages, stats, health). Services in `src/services/` (importer, scrapers, scrapeQueue, imageStorage, pdf, auth). Vitest for tests, Puppeteer for PDF rendering, Cheerio + Playwright-style scrapers under `services/scrapers/`.
- `apps/web` — React 18 + Vite + react-router-dom. JWT in HTTP-only cookie for auth. `pages/SelectionsEdit.tsx` is the main editor; supporting components include `AutoComplete`, `TradeForm`, `EntryCard`, `PatternPreview`, `ShowerView`, `TileEntryPreview`, `PdfActions`. Fuse.js powers fuzzy autocomplete. Vite proxies `/api` to the server.
- `packages/shared` — zod schemas and TS types reused by both apps. Entry points: `index.ts`, `trades.ts`, `importContract.ts`, `exampleProject.ts`. `shape.ts` holds shape detection used by both the client SVG pattern preview and the server PDF renderer.

## Common commands

Run from repo root unless noted. pnpm 10, Node >= 20.

- `pnpm install` — first-time setup.
- `pnpm dev` — server (port 4000) + web (5173) concurrently; Vite proxies `/api` to 4000.
- `pnpm build` — recursive build of all workspaces.
- `pnpm test` — recursive test (server runs vitest; web/shared are no-ops today).
- `pnpm typecheck` — recursive tsc --noEmit.
- `pnpm --filter @custom-homes/server test` — vitest only.
- `pnpm db:generate` — drizzle-kit generate migrations from schema.
- `pnpm db:migrate` — apply pending migrations.
- `pnpm db:reset` — drop dev.sqlite, re-run migrations, re-seed.
- `pnpm db:seed` — load seed projects via the import path.
- `pnpm db:seed-bath-tile` — load `seed/bath-tile/*.json` (POC focus data).
- `pnpm db:import-tile-images` / `pnpm db:dump-image-prompts` / `pnpm db:normalize-brands` / `pnpm db:test-scraper` — image and scraper maintenance scripts.

## Env vars

From `.env.example`:

- `DATABASE_URL` — `file:./dev.sqlite` for SQLite dev, `postgres://user:pass@host:5432/db` for prod.
- `PORT` — Express port, default `4000`.
- `ADMIN_TOKEN` — required `x-admin-token` header on `/api/admin/*` (e.g. `dev-token` for dev).
- `JWT_SECRET` — JWT signing secret; change in prod.
- `WEB_ORIGIN` — CORS origin, e.g. `http://localhost:5173`.
- `NODE_ENV` — `development` locally.

## Data model

`projects` → `rooms` → trade-specific entry tables (`tile_entries`, `paint_entries`, etc.), each keyed by `room_id`. Every table includes the BT-sync mixin (`external_id`, `external_source`, `synced_at`) plus a partial unique index on `(external_source, external_id)`, so the September 2026 BuilderTrend integration can sync without a schema migration.

## POC focus

Bath/shower tile. Shape detection (`packages/shared/src/shape.ts`) drives the pattern compositor — subway, hexagon, picket, penny round, palladiana mosaic, herringbone, etc. — and is the primary disambiguator for scrapers; size and color are secondary signals.

## Sandbox notes

This repo runs inside the Claude Code sandbox (`IS_SANDBOX=yes`). Outbound network is allowlisted to `registry.npmjs.org` plus the Google Search API. `WebFetch` may be blocked for arbitrary domains — use `WebSearch` to validate URL patterns before wiring a scraper, and assume manufacturer sites are not directly reachable from sessions. Real scraping runs out-of-sandbox.

## Phases shipped

- Phase 1 — DB schema, dual-dialect Drizzle, admin JSON import.
- Phase 2 — Autocomplete + Fuse.js fuzzy matching, selections form (`SelectionsEdit`).
- Phase 3 — Playwright-style scrapers for Daltile, Bedrosians, Emser; manufacturer image pipeline.
- Phase 4 — Shape-aware SVG pattern compositor (shared between web preview and server PDF).
- Phase 5 — Puppeteer PDF export per trade and per room.
- Phase 6 — JWT auth in HTTP-only cookie, users table, login page.

## Deliberately deferred

- Multi-tenant (single builder for now).
- Real BuilderTrend live sync (mixin is in place; integration scheduled Sep 2026).
- Scrapers for manufacturers beyond Daltile / Bedrosians / Emser.
- Scrapers for trades other than tile.
