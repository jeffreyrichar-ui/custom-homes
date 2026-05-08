import { randomUUID } from "node:crypto";
import {
  importContractSchema,
  type ImportContract,
  type ImportError,
  type ImportResult,
  type ImportSummary,
  type ImportTableSummary,
  TRADE_KINDS,
  ENTRY_TABLE_BY_TRADE,
  type TradeKind,
} from "@custom-homes/shared";
import type { Dbi } from "../db/dbi.js";
import { tradeMeta, entrySchemaFor, isTradeKind } from "../lib/tradeRegistry.js";

type Action = "created" | "updated";

const blank = (): ImportTableSummary => ({
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
});

function emptySummary(): ImportSummary {
  return {
    projects: blank(),
    rooms: blank(),
    tile_entries: blank(),
    paint_entries: blank(),
    carpet_entries: blank(),
    hardwood_entries: blank(),
    cabinet_entries: blank(),
    countertop_entries: blank(),
  };
}

function bumpAction(summary: ImportSummary, table: keyof ImportSummary, action: Action) {
  const s = summary[table];
  if (action === "created") s.created += 1;
  else s.updated += 1;
}

function bumpFailed(summary: ImportSummary, table: keyof ImportSummary) {
  summary[table].failed += 1;
}

async function upsertProject(
  tx: Dbi,
  payload: ImportContract,
): Promise<{ id: string; action: Action }> {
  const { project, external_id, external_source } = payload;

  // Match by external_id if provided (partial unique index)
  if (external_id) {
    const rows = await tx.query<{ id: string }>(
      `SELECT id FROM projects WHERE external_source = $1 AND external_id = $2 LIMIT 1`,
      [external_source ?? null, external_id],
    );
    if (rows.length > 0) {
      const id = rows[0]!.id;
      await tx.exec(
        `UPDATE projects SET name = $1, address = $2, external_source = $3, external_id = $4 WHERE id = $5`,
        [project.name, project.address ?? null, external_source ?? null, external_id, id],
      );
      return { id, action: "updated" };
    }
  } else {
    // Fall back to (name, address) match — best-effort
    const rows = await tx.query<{ id: string }>(
      `SELECT id FROM projects
       WHERE name = $1
         AND COALESCE(address, '') = COALESCE($2, '')
       LIMIT 1`,
      [project.name, project.address ?? null],
    );
    if (rows.length > 0) {
      const id = rows[0]!.id;
      await tx.exec(
        `UPDATE projects SET name = $1, address = $2 WHERE id = $3`,
        [project.name, project.address ?? null, id],
      );
      return { id, action: "updated" };
    }
  }

  const id = randomUUID();
  await tx.exec(
    `INSERT INTO projects (id, name, address, external_source, external_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      project.name,
      project.address ?? null,
      external_source ?? null,
      external_id ?? null,
    ],
  );
  return { id, action: "created" };
}

async function upsertRoom(
  tx: Dbi,
  projectId: string,
  roomName: string,
  externalSource: string | null,
  externalId: string | null,
): Promise<{ id: string; action: Action }> {
  const rows = await tx.query<{ id: string }>(
    `SELECT id FROM rooms WHERE project_id = $1 AND room_name = $2 LIMIT 1`,
    [projectId, roomName],
  );
  if (rows.length > 0) {
    const id = rows[0]!.id;
    await tx.exec(
      `UPDATE rooms SET external_source = $1, external_id = $2 WHERE id = $3`,
      [externalSource, externalId, id],
    );
    return { id, action: "updated" };
  }
  const id = randomUUID();
  await tx.exec(
    `INSERT INTO rooms (id, project_id, room_name, external_source, external_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, projectId, roomName, externalSource, externalId],
  );
  return { id, action: "created" };
}

async function upsertEntry(
  tx: Dbi,
  trade: TradeKind,
  roomId: string,
  validatedEntry: Record<string, unknown>,
): Promise<{ id: string; action: Action }> {
  const meta = tradeMeta(trade);
  const primary = meta.primaryKey(validatedEntry as never);
  const usePrimary = primary.values.every((v) => v !== null && v !== undefined);
  const key = usePrimary ? primary : meta.fallbackKey(validatedEntry as never);

  const lookupParams: unknown[] = [roomId, ...key.values];
  const whereClauses = key.columns
    .map((c, i) => `${c} = $${i + 2}`)
    .join(" AND ");
  const found = await tx.query<{ id: string }>(
    `SELECT id FROM ${meta.table} WHERE room_id = $1 AND ${whereClauses} LIMIT 1`,
    lookupParams,
  );

  const row = meta.rowColumns(validatedEntry as never);
  const cols = Object.keys(row);

  if (found.length > 0) {
    const id = found[0]!.id;
    const setClauses = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
    await tx.exec(
      `UPDATE ${meta.table} SET ${setClauses} WHERE id = $${cols.length + 1}`,
      [...Object.values(row), id],
    );
    return { id, action: "updated" };
  }

  const id = randomUUID();
  const insertCols = ["id", "room_id", ...cols];
  const insertVals = [id, roomId, ...Object.values(row)];
  const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");
  await tx.exec(
    `INSERT INTO ${meta.table} (${insertCols.join(", ")}) VALUES (${placeholders})`,
    insertVals,
  );
  return { id, action: "created" };
}

export type RunImportOptions = { dryRun: boolean };

export async function runImport(
  dbi: Dbi,
  rawPayload: unknown,
  opts: RunImportOptions = { dryRun: false },
): Promise<ImportResult> {
  const summary = emptySummary();
  const errors: ImportError[] = [];

  // Top-level validation — abort with no writes if shape is malformed
  const parsed = importContractSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return {
      project_id: null,
      summary,
      errors: parsed.error.issues.map((iss) => ({
        path: iss.path.join("."),
        code: iss.code,
        field: typeof iss.path[iss.path.length - 1] === "string"
          ? String(iss.path[iss.path.length - 1])
          : undefined,
        message: iss.message,
      })),
    };
  }

  const payload = parsed.data;

  return dbi.withTransaction(async (tx) => {
    const projectResult = await upsertProject(tx, payload);
    bumpAction(summary, "projects", projectResult.action);

    for (let i = 0; i < payload.rooms.length; i += 1) {
      const room = payload.rooms[i]!;
      const roomPath = `rooms[${i}]`;
      let roomResult: { id: string; action: Action };
      try {
        roomResult = await upsertRoom(
          tx,
          projectResult.id,
          room.room_name,
          room.external_source ?? null,
          room.external_id ?? null,
        );
        bumpAction(summary, "rooms", roomResult.action);
      } catch (err) {
        bumpFailed(summary, "rooms");
        errors.push({
          path: roomPath,
          code: "room_upsert_failed",
          message: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      for (let j = 0; j < room.entries.length; j += 1) {
        const rawEntry = room.entries[j];
        const entryPath = `${roomPath}.entries[${j}]`;

        if (typeof rawEntry !== "object" || rawEntry === null) {
          errors.push({
            path: entryPath,
            code: "invalid_entry",
            message: "entry must be an object",
          });
          continue;
        }
        const trade = (rawEntry as { trade?: unknown }).trade;
        if (!isTradeKind(trade)) {
          errors.push({
            path: entryPath,
            code: "unknown_trade",
            field: "trade",
            message: `trade must be one of ${TRADE_KINDS.join(", ")}`,
          });
          continue;
        }

        const schema = entrySchemaFor(trade);
        const result = schema.safeParse(rawEntry);
        if (!result.success) {
          for (const iss of result.error.issues) {
            errors.push({
              path: `${entryPath}.${iss.path.join(".")}`,
              trade,
              code: iss.code,
              field: typeof iss.path[iss.path.length - 1] === "string"
                ? String(iss.path[iss.path.length - 1])
                : undefined,
              message: iss.message,
            });
          }
          bumpFailed(summary, ENTRY_TABLE_BY_TRADE[trade]);
          continue;
        }

        try {
          const entryResult = await upsertEntry(
            tx,
            trade,
            roomResult.id,
            result.data as Record<string, unknown>,
          );
          bumpAction(summary, ENTRY_TABLE_BY_TRADE[trade], entryResult.action);
        } catch (err) {
          bumpFailed(summary, ENTRY_TABLE_BY_TRADE[trade]);
          errors.push({
            path: entryPath,
            trade,
            code: "entry_upsert_failed",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (opts.dryRun) {
      // Throw a sentinel to roll back; the caller catches and returns the result.
      throw new DryRunRollback({
        project_id: projectResult.id,
        summary,
        errors,
      });
    }

    return {
      project_id: projectResult.id,
      summary,
      errors,
    } satisfies ImportResult;
  }).catch((err) => {
    if (err instanceof DryRunRollback) {
      return err.result;
    }
    throw err;
  });
}

class DryRunRollback extends Error {
  constructor(public result: ImportResult) {
    super("dry-run rollback");
  }
}
