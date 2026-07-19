import { randomUUID } from "node:crypto";
import {
  BT_CATEGORY_TO_TRADE,
  ENTRY_SCHEMA_BY_TRADE,
  ENTRY_TABLE_BY_TRADE,
  type BtSelection,
  type BtSnapshot,
  type SyncCounts,
  type SyncReport,
  type TradeKind,
} from "@custom-homes/shared";
import type { Dbi } from "../../db/dbi.js";
import { tradeMeta } from "../../lib/tradeRegistry.js";
import type { BtClient } from "./client.js";

const SOURCE = "buildertrend";

/**
 * Pull-sync from BuilderTrend. Identity is the BT-sync mixin every table
 * already carries: (external_source, external_id).
 *
 * Ownership split (the product rule, not a technicality):
 * - BT owns project name/address, room existence, and the commercial
 *   columns on entries — allowance, deadline, status.
 * - Tamara owns every design field. An entry that already exists is only
 *   ever touched on the commercial columns; brand/style/color/pattern/...
 *   are never overwritten by sync.
 * - New entries are created only when BT carries enough product data to
 *   pass the trade's own validation schema; allowance-only placeholders
 *   are reported as skipped rather than persisted with fabricated values.
 */
export async function runBtSync(dbi: Dbi, client: BtClient): Promise<SyncReport> {
  const runId = randomUUID();
  await dbi.exec(
    `INSERT INTO sync_runs (id, source, status) VALUES ($1, $2, 'running')`,
    [runId, SOURCE],
  );

  const startedAt = new Date().toISOString();
  try {
    const snapshot = await client.fetchSnapshot();
    const report = await dbi.withTransaction((tx) => applySnapshot(tx, snapshot));
    const finished: SyncReport = {
      source: SOURCE,
      run_id: runId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      ...report,
    };
    await dbi.exec(
      `UPDATE sync_runs SET status = 'ok', summary = $1, finished_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [JSON.stringify(finished), runId],
    );
    return finished;
  } catch (err) {
    await dbi.exec(
      `UPDATE sync_runs SET status = 'error', error = $1, finished_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [err instanceof Error ? err.message : String(err), runId],
    );
    throw err;
  }
}

type ApplyResult = Omit<SyncReport, "source" | "run_id" | "started_at" | "finished_at">;

async function applySnapshot(tx: Dbi, snapshot: BtSnapshot): Promise<ApplyResult> {
  const projects: SyncCounts = { created: 0, updated: 0, skipped: 0 };
  const rooms: SyncCounts = { created: 0, updated: 0, skipped: 0 };
  const entries: SyncCounts = { created: 0, updated: 0, skipped: 0 };
  const unmapped: SyncReport["unmapped"] = [];

  // job id -> our project id
  const projectIdByJob = new Map<string, string>();
  // `${projectId}|${room name lower}` -> room id
  const roomIdByKey = new Map<string, string>();

  for (const job of snapshot.jobs) {
    const existing = await tx.query<{ id: string }>(
      `SELECT id FROM projects WHERE external_source = $1 AND external_id = $2 LIMIT 1`,
      [SOURCE, job.id],
    );
    if (existing.length > 0) {
      const id = existing[0]!.id;
      await tx.exec(
        `UPDATE projects SET name = $1, address = $2, synced_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [job.name, job.address ?? null, id],
      );
      projectIdByJob.set(job.id, id);
      projects.updated += 1;
    } else {
      const id = randomUUID();
      await tx.exec(
        `INSERT INTO projects (id, name, address, external_id, external_source, synced_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [id, job.name, job.address ?? null, job.id, SOURCE],
      );
      projectIdByJob.set(job.id, id);
      projects.created += 1;
    }
  }

  for (const sel of snapshot.selections) {
    const projectId = projectIdByJob.get(sel.job_id);
    if (!projectId) {
      // Selection for a job outside this snapshot — nothing to attach to.
      entries.skipped += 1;
      continue;
    }

    // BT owns room existence — create the room even when the selection's
    // category doesn't map to one of our trades.
    const roomId = await upsertRoom(tx, projectId, sel.room, roomIdByKey, rooms);

    const trade = resolveTrade(sel);
    if (!trade) {
      unmapped.push({ selection_id: sel.id, category: sel.category });
      entries.skipped += 1;
      continue;
    }

    const table = ENTRY_TABLE_BY_TRADE[trade];

    const found = await tx.query<{ id: string }>(
      `SELECT id FROM ${table} WHERE external_source = $1 AND external_id = $2 LIMIT 1`,
      [SOURCE, sel.id],
    );
    if (found.length > 0) {
      // Commercial columns only — design fields belong to Tamara.
      await tx.exec(
        `UPDATE ${table}
         SET allowance = $1, deadline = $2, status = $3, synced_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [sel.allowance ?? null, sel.deadline ?? null, sel.status ?? "selected", found[0]!.id],
      );
      entries.updated += 1;
      continue;
    }

    const candidate = buildCandidateEntry(trade, sel);
    const parsed = ENTRY_SCHEMA_BY_TRADE[trade].safeParse(candidate);
    if (!parsed.success) {
      // BT hasn't captured enough product data to make a real entry yet.
      entries.skipped += 1;
      continue;
    }

    // Tamara may already have this exact product as a local entry (from the
    // historical import or hand entry). Adopt it — link the BT id and take
    // over the commercial columns — instead of inserting a natural-key
    // duplicate.
    const meta = tradeMeta(trade);
    const adopted = await findByNaturalKey(tx, table, roomId, meta, parsed.data as never);
    if (adopted) {
      await tx.exec(
        `UPDATE ${table}
         SET external_id = $1, external_source = $2,
             allowance = $3, deadline = $4, status = $5,
             synced_at = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [sel.id, SOURCE, sel.allowance ?? null, sel.deadline ?? null, sel.status ?? "selected", adopted],
      );
      entries.updated += 1;
      continue;
    }

    const row = meta.rowColumns(parsed.data as never);
    row.external_id = sel.id;
    row.external_source = SOURCE;
    const cols = ["id", "room_id", ...Object.keys(row), "synced_at"];
    const vals = [randomUUID(), roomId, ...Object.values(row)];
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
    await tx.exec(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders}, CURRENT_TIMESTAMP)`,
      vals,
    );
    entries.created += 1;
  }

  return { projects, rooms, entries, unmapped };
}

function resolveTrade(sel: BtSelection): TradeKind | null {
  return BT_CATEGORY_TO_TRADE[sel.category.trim().toLowerCase()] ?? null;
}

/**
 * Natural-key lookup mirroring the importer's null-safe matching: primary
 * key when fully populated, else the fallback key; null values compare via
 * IS NULL (portable across SQLite/Postgres).
 */
async function findByNaturalKey(
  tx: Dbi,
  table: string,
  roomId: string,
  meta: ReturnType<typeof tradeMeta>,
  entry: never,
): Promise<string | null> {
  const primary = meta.primaryKey(entry);
  const usePrimary = primary.values.every((v) => v !== null && v !== undefined);
  const key = usePrimary ? primary : meta.fallbackKey(entry);

  const params: unknown[] = [roomId];
  const clauses = key.columns
    .map((c, i) => {
      const v = key.values[i];
      if (v === null || v === undefined) return `${c} IS NULL`;
      params.push(v);
      return `${c} = $${params.length}`;
    })
    .join(" AND ");
  const rows = await tx.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE room_id = $1 AND ${clauses} LIMIT 1`,
    params,
  );
  return rows[0]?.id ?? null;
}

async function upsertRoom(
  tx: Dbi,
  projectId: string,
  roomName: string,
  cache: Map<string, string>,
  counts: SyncCounts,
): Promise<string> {
  const key = `${projectId}|${roomName.trim().toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = await tx.query<{ id: string }>(
    `SELECT id FROM rooms WHERE project_id = $1 AND LOWER(room_name) = LOWER($2) LIMIT 1`,
    [projectId, roomName.trim()],
  );
  if (existing.length > 0) {
    const id = existing[0]!.id;
    await tx.exec(
      `UPDATE rooms SET external_source = $1, synced_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [SOURCE, id],
    );
    cache.set(key, id);
    counts.updated += 1;
    return id;
  }
  const id = randomUUID();
  await tx.exec(
    `INSERT INTO rooms (id, project_id, room_name, external_source, synced_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
    [id, projectId, roomName.trim(), SOURCE],
  );
  cache.set(key, id);
  counts.created += 1;
  return id;
}

/**
 * Shape a BT selection's structured fields into the trade's entry input.
 * Only used at creation time; the trade schema decides whether BT captured
 * enough (e.g. tile requires brand + location_in_room).
 */
function buildCandidateEntry(trade: TradeKind, sel: BtSelection): Record<string, unknown> {
  const f = sel.fields ?? {};
  const note = sel.title ? `BT: ${sel.title}` : null;
  return {
    trade,
    ...f,
    notes: (f.notes as string | null | undefined) ?? note,
    allowance: sel.allowance ?? null,
    deadline: sel.deadline ?? null,
    status: sel.status ?? "selected",
  };
}
