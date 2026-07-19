import { z } from "zod";
import { TRADE_KINDS, type TradeKind } from "./trades.js";

/**
 * BuilderTrend sync contract. BT's partner API surfaces jobs (projects) and
 * per-room selection allowances; this is the subset our schema needs, kept
 * transport-agnostic so the same sync engine runs against the live HTTP
 * client or checked-in fixtures. Field mapping notes:
 *
 * - `bt_job.id` -> projects.external_id (external_source 'buildertrend')
 * - selections carry the room name and a category we map onto a trade
 * - allowance/deadline/status flow onto the matched entry columns; design
 *   fields (brand/style/color/...) NEVER flow from BT — Tamara is the
 *   design authority and sync must not clobber her selections.
 */

export const btJobSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  address: z.string().nullish(),
  status: z.string().nullish(),
});
export type BtJob = z.infer<typeof btJobSchema>;

/** BT category strings we recognise, mapped to our trade kinds. */
export const BT_CATEGORY_TO_TRADE: Record<string, TradeKind> = {
  tile: "tile",
  "tile & stone": "tile",
  flooring_tile: "tile",
  paint: "paint",
  "paint & wallcovering": "paint",
  carpet: "carpet",
  flooring_carpet: "carpet",
  hardwood: "hardwood",
  flooring_hardwood: "hardwood",
  cabinets: "cabinet",
  cabinetry: "cabinet",
  countertops: "countertop",
  "countertops & surfaces": "countertop",
};

export const btSelectionSchema = z.object({
  id: z.string().min(1),
  job_id: z.string().min(1),
  room: z.string().min(1),
  category: z.string().min(1),
  /** Display title BT shows, e.g. "Master shower wall tile". */
  title: z.string().nullish(),
  allowance: z.number().nullish(),
  /** ISO timestamp. */
  deadline: z.string().nullish(),
  /** BT approval state, stored verbatim on the entry's status column. */
  status: z.string().nullish(),
  /**
   * Optional structured fields when the BT selection has been filled in
   * (vendor-entered product data). Used only when CREATING a new entry;
   * never overwrites existing design fields.
   */
  fields: z.record(z.string(), z.string().nullable()).nullish(),
});
export type BtSelection = z.infer<typeof btSelectionSchema>;

export const btSnapshotSchema = z.object({
  jobs: z.array(btJobSchema),
  selections: z.array(btSelectionSchema),
});
export type BtSnapshot = z.infer<typeof btSnapshotSchema>;

export type SyncCounts = { created: number; updated: number; skipped: number };

export type SyncReport = {
  source: "buildertrend";
  run_id: string;
  started_at: string;
  finished_at: string;
  projects: SyncCounts;
  rooms: SyncCounts;
  entries: SyncCounts;
  /** Selections whose category didn't map to a trade — listed, not fatal. */
  unmapped: Array<{ selection_id: string; category: string }>;
};

export const ALL_TRADE_KINDS = TRADE_KINDS;
