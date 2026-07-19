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

/**
 * Turn a stored snake_case token into a human label: "shower_walls" ->
 * "Shower walls". Stored values stay snake_case; only display changes.
 */
export function humanizeToken(s: string): string {
  const spaced = s.replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : spaced;
}
