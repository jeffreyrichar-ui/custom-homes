export const TRADE_KINDS = [
  "tile",
  "paint",
  "carpet",
  "hardwood",
  "cabinet",
  "countertop",
] as const;

export type TradeKind = (typeof TRADE_KINDS)[number];

export const ENTRY_TABLE_BY_TRADE = {
  tile: "tile_entries",
  paint: "paint_entries",
  carpet: "carpet_entries",
  hardwood: "hardwood_entries",
  cabinet: "cabinet_entries",
  countertop: "countertop_entries",
} as const satisfies Record<TradeKind, string>;

export type EntryTableName = (typeof ENTRY_TABLE_BY_TRADE)[TradeKind];
