import { z } from "zod";
import { TRADE_KINDS } from "./trades.js";

const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/));

const btSyncFields = {
  external_id: z.string().min(1).nullish(),
  external_source: z.string().min(1).nullish(),
};

const entryCommon = {
  ...btSyncFields,
  notes: z.string().nullish(),
  image_url: z.string().url().nullish(),
  allowance: z.number().nonnegative().nullish(),
  deadline: isoDate.nullish(),
  status: z.string().min(1).nullish(),
  is_new_entry: z.boolean().nullish(),
};

export const tileEntrySchema = z.object({
  trade: z.literal("tile"),
  brand: z.string().min(1),
  style: z.string().nullish(),
  color: z.string().nullish(),
  sku: z.string().nullish(),
  grout_color: z.string().nullish(),
  grout_sku: z.string().nullish(),
  edge_profile: z.string().nullish(),
  pattern: z.string().nullish(),
  location_in_room: z.string().min(1),
  ...entryCommon,
});

export const paintEntrySchema = z.object({
  trade: z.literal("paint"),
  brand: z.string().min(1),
  color_name: z.string().min(1),
  sku: z.string().nullish(),
  sheen: z.string().nullish(),
  surface_application: z.string().nullish(),
  ...entryCommon,
});

export const carpetEntrySchema = z.object({
  trade: z.literal("carpet"),
  brand: z.string().min(1),
  style: z.string().nullish(),
  color: z.string().nullish(),
  sku: z.string().nullish(),
  pile: z.string().nullish(),
  ...entryCommon,
});

export const hardwoodEntrySchema = z.object({
  trade: z.literal("hardwood"),
  brand: z.string().min(1),
  species: z.string().nullish(),
  color: z.string().nullish(),
  sku: z.string().nullish(),
  plank_width: z.string().nullish(),
  pattern: z.string().nullish(),
  ...entryCommon,
});

export const cabinetEntrySchema = z.object({
  trade: z.literal("cabinet"),
  brand: z.string().min(1),
  style: z.string().nullish(),
  color: z.string().nullish(),
  hardware: z.string().nullish(),
  ...entryCommon,
});

export const countertopEntrySchema = z.object({
  trade: z.literal("countertop"),
  material: z.string().min(1),
  brand: z.string().min(1),
  color: z.string().nullish(),
  edge_profile: z.string().nullish(),
  ...entryCommon,
});

export const entrySchema = z.discriminatedUnion("trade", [
  tileEntrySchema,
  paintEntrySchema,
  carpetEntrySchema,
  hardwoodEntrySchema,
  cabinetEntrySchema,
  countertopEntrySchema,
]);

export const roomSchema = z.object({
  room_name: z.string().min(1),
  ...btSyncFields,
  entries: z.array(z.unknown()).default([]),
});

export const importContractSchema = z.object({
  ...btSyncFields,
  project: z.object({
    name: z.string().min(1),
    address: z.string().nullish(),
  }),
  rooms: z.array(roomSchema).default([]),
});

export type TileEntryInput = z.infer<typeof tileEntrySchema>;
export type PaintEntryInput = z.infer<typeof paintEntrySchema>;
export type CarpetEntryInput = z.infer<typeof carpetEntrySchema>;
export type HardwoodEntryInput = z.infer<typeof hardwoodEntrySchema>;
export type CabinetEntryInput = z.infer<typeof cabinetEntrySchema>;
export type CountertopEntryInput = z.infer<typeof countertopEntrySchema>;
export type EntryInput = z.infer<typeof entrySchema>;
export type RoomInput = z.infer<typeof roomSchema>;
export type ImportContract = z.infer<typeof importContractSchema>;

export type ImportTableSummary = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

export type ImportError = {
  path: string;
  trade?: string;
  code: string;
  field?: string;
  message: string;
};

export type ImportSummary = {
  projects: ImportTableSummary;
  rooms: ImportTableSummary;
  tile_entries: ImportTableSummary;
  paint_entries: ImportTableSummary;
  carpet_entries: ImportTableSummary;
  hardwood_entries: ImportTableSummary;
  cabinet_entries: ImportTableSummary;
  countertop_entries: ImportTableSummary;
};

export type ImportResult = {
  project_id: string | null;
  summary: ImportSummary;
  errors: ImportError[];
};

export const ENTRY_SCHEMA_BY_TRADE = {
  tile: tileEntrySchema,
  paint: paintEntrySchema,
  carpet: carpetEntrySchema,
  hardwood: hardwoodEntrySchema,
  cabinet: cabinetEntrySchema,
  countertop: countertopEntrySchema,
} as const satisfies Record<(typeof TRADE_KINDS)[number], z.ZodTypeAny>;
