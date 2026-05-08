# Custom Homes — Finish Selections (Phase 1)

A finish-selections system for Todd Campbell Homes. Phase 1 ships the database schema and an admin JSON-import interface so the user can seed historical project data extracted manually via Claude desktop.

See `/root/.claude/plans/phase-1-database-functional-rocket.md` for the full plan and roadmap to Phases 2–6.

## Stack

- **Server**: Node.js + Express + Drizzle ORM (`apps/server`)
- **Web**: React + Vite (`apps/web`)
- **Shared**: zod import contract (`packages/shared`)
- **DB**: SQLite for local dev, PostgreSQL for production
- **Package manager**: pnpm workspaces

## Setup

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed         # optional — inserts the example project
pnpm dev             # server :4000, web :5173
```

Open http://localhost:5173/admin/import. The first time, paste the value of `ADMIN_TOKEN` from your `.env` when prompted.

Click **Load example** → **Validate** → **Import**, then visit `/projects` to confirm the data landed.

## Workspaces

| Path | Purpose |
|---|---|
| `apps/server` | Express API + Drizzle schema + migrations |
| `apps/web`    | React admin UI |
| `packages/shared` | zod import contract reused by server and web |

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Run server + web in parallel with hot reload |
| `pnpm test` | Run vitest in every workspace |
| `pnpm typecheck` | `tsc --noEmit` in every workspace |
| `pnpm db:generate` | Regenerate Drizzle migrations from `schema.ts` |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:reset` | Delete `dev.sqlite` and re-run migrations + seed |
| `pnpm db:seed` | Insert the canned example project |
