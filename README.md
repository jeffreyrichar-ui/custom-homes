# Custom Homes

Finish-selections system for Todd Campbell Custom Homes that replaces designer Tamara's spreadsheet workflow. It tracks tile, paint, carpet, hardwood, cabinet, and countertop selections per room per project, generates printable trade-by-trade PDFs, and ships an admin JSON import path for backfilling historical data. POC focus is bath/shower tile — that's the trade we get rock-solid first; the others share the same shape.

## Quickstart

Requires Node >= 20 and pnpm 10 (managed via corepack from `package.json#packageManager`).

```bash
git clone <repo-url> custom-homes && cd custom-homes
pnpm install
cp .env.example .env
pnpm db:reset && pnpm db:seed
pnpm dev
```

Web runs at http://localhost:5173 and the API at http://localhost:4000 (Vite proxies `/api` through to it). The admin import page at `/admin/import` is guarded by the `ADMIN_TOKEN` header — paste the value from `.env` (defaults to `dev-token`) the first time the UI prompts.

## Architecture

- `apps/server` — Express + Drizzle ORM. Dual schema files (`schema.pg.ts` + `schema.sqlite.ts`) let the same routes target PostgreSQL in prod and SQLite in dev via the `dbi` adapter. Routes in `src/routes/`, services in `src/services/` (importer, scrapers, scrape queue, image storage, PDF, auth). Tests via Vitest, PDF rendering via Puppeteer.
- `apps/web` — React 18 + Vite + react-router-dom. JWT lives in an HTTP-only cookie. `SelectionsEdit.tsx` is the main editor; Fuse.js drives fuzzy autocomplete; shared shape detection powers the SVG pattern preview.
- `packages/shared` — zod schemas and TS types reused by both apps, including the import contract and the shape detector that's shared between the web pattern preview and the server PDF renderer.

Every trade-entry table carries a BT-sync mixin (`external_id`, `external_source`, `synced_at`) with a partial unique index on `(external_source, external_id)`. The September 2026 BuilderTrend integration can land without a schema migration.

## Commands

Run from the repo root.

| Command | What it does |
|---|---|
| `pnpm dev` | Start server (4000) + web (5173) + shared watcher concurrently. |
| `pnpm build` | Recursive build of all workspaces. |
| `pnpm test` | Run all workspace tests (vitest in `apps/server`; web/shared are no-ops today). |
| `pnpm typecheck` | `tsc --noEmit` across all packages. |
| `pnpm db:generate` | Regenerate Drizzle migrations from the schema files. |
| `pnpm db:migrate` | Apply pending migrations. |
| `pnpm db:reset` | Drop `dev.sqlite`, re-run migrations, re-seed. |
| `pnpm db:seed` | Insert the canned example project. |
| `pnpm db:seed-bath-tile` | Load the bath/shower tile POC corpus (~218 entries across 18 projects). |
| `pnpm db:import-tile-images` | Run scrapers against tile entries that need manufacturer images. |
| `pnpm db:dump-image-prompts` | Generate a JSON file of `(brand, sku, style, color)` prompts for the manual image-lookup fallback. |
| `pnpm db:normalize-brands` | Run vendor/brand normalization on existing entries. |
| `pnpm db:test-scraper` | Smoke-test a single scraper against a sample URL. |

## Environment

Copy `.env.example` to `.env`. Variables:

| Var | Description |
|---|---|
| `DATABASE_URL` | `file:./dev.sqlite` for SQLite (dev) or `postgres://user:pass@host:5432/dbname` (prod). |
| `PORT` | Express port. Defaults to `4000`. |
| `ADMIN_TOKEN` | Required `x-admin-token` header on `/api/admin/*` (also accepted as a legacy fallback alongside JWT auth). |
| `JWT_SECRET` | Signing secret for the auth cookie. Change in production. |
| `WEB_ORIGIN` | CORS origin for the API — set to the web origin (`http://localhost:5173` in dev, your Vercel URL in prod). |
| `NODE_ENV` | `development` locally, `production` on Render. |

## Production deployment

The current setup splits hosting: API on Render, static SPA on Vercel. Render's free tier sleeps after inactivity but Vercel's static serving is instant, so the SPA stays snappy while the API can cold-start. If you'd rather host on one box, build the web into `apps/server`'s static dir and serve it from Express.

### Server on Render

1. Push the branch to GitHub. Render picks up `render.yaml` automatically.
2. In the Render dashboard: Blueprint → connect repo → it provisions the Postgres database (`custom-homes-db`) and the web service (`custom-homes-api`) from the blueprint.
3. Set the `sync: false` env vars manually in the dashboard:
   - `JWT_SECRET` — 32+ random bytes.
   - `ADMIN_TOKEN` — your production admin token.
   - `WEB_ORIGIN` — the Vercel URL from the next section (set after Vercel is up).
4. The build runs `pnpm install` then builds `@custom-homes/shared` and `@custom-homes/server`. Start command is `pnpm --filter @custom-homes/server start`. Run `pnpm db:migrate` manually against the production database on first deploy and after any new migration (the server only auto-migrates outside production).
5. Health check: `GET https://<service>.onrender.com/api/health`.

### Web on Vercel

1. In Vercel: import the project with the repo root as the project root (not `apps/web` — Vercel reads `vercel.json` from the root and that config builds `@custom-homes/web` into `apps/web/dist`).
2. After the first deploy, replace the placeholder in `vercel.json`'s rewrite (`https://custom-homes-api.onrender.com/api/:path*`) with the actual Render URL if it differs, and redeploy.
3. Set the Render service's `WEB_ORIGIN` to your Vercel URL so CORS allows the SPA.
4. No env vars needed on Vercel — it's a static SPA that proxies `/api/*` to Render via `vercel.json`.

## Importing historical data

The admin import page at `/admin/import` accepts JSON in the shape defined by `packages/shared/src/importContract.ts`. For the initial backfill, point Claude desktop at each portal PDF, ask it to extract finish selections matching the import contract, and paste the result into the admin import page. The files under `seed/bath-tile/*.json` are the canonical historical corpus (~218 tile entries across 18 projects) and double as the seed payload for `pnpm db:seed-bath-tile`.

## What's deferred

- Other trades (paint, carpet, hardwood, cabinets, countertops) — schemas exist, scrapers and form polish are deferred until tile is rock-solid.
- More tile manufacturer scrapers — current set is Daltile, Bedrosians, Emser, Marazzi, MSI, and Schluter (see `apps/server/src/services/scrapers/`).
- Real BuilderTrend live sync — the BT-sync mixin is in place; the sync worker is scheduled for the September 2026 v2.
- Multi-tenant — single builder for now.
