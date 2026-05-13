import {
  TRADE_KINDS,
  type TradeKind,
  ENTRY_TABLE_BY_TRADE,
  ENTRY_SCHEMA_BY_TRADE,
  type EntryInput,
} from "@custom-homes/shared";

export type EntryKey = {
  columns: string[];
  values: unknown[];
};

export type TradeMeta = {
  kind: TradeKind;
  table: string;
  /** Primary natural key. May fall back to `fallbackKey` if any value is null. */
  primaryKey(entry: EntryInput): EntryKey;
  /** Fallback when primary key has nulls (e.g. SKU-less items). */
  fallbackKey(entry: EntryInput): EntryKey;
  /** All persisted columns mapped from the entry input (excludes id, room_id, mixin defaults). */
  rowColumns(entry: EntryInput): Record<string, unknown>;
};

const baseColumns = (
  e: EntryInput & { allowance?: number | null; deadline?: string | null },
): Record<string, unknown> => ({
  notes: (e as { notes?: string | null }).notes ?? null,
  image_url: (e as { image_url?: string | null }).image_url ?? null,
  allowance: e.allowance ?? null,
  deadline: e.deadline ?? null,
  status: (e as { status?: string | null }).status ?? "selected",
  is_new_entry: (e as { is_new_entry?: boolean | null }).is_new_entry ?? false,
  external_id: (e as { external_id?: string | null }).external_id ?? null,
  external_source: (e as { external_source?: string | null }).external_source ?? null,
});

const REGISTRY: Record<TradeKind, TradeMeta> = {
  tile: {
    kind: "tile",
    table: ENTRY_TABLE_BY_TRADE.tile,
    primaryKey: (e) => {
      const t = e as Extract<EntryInput, { trade: "tile" }>;
      return {
        columns: ["brand", "sku", "location_in_room"],
        values: [t.brand, t.sku ?? null, t.location_in_room],
      };
    },
    fallbackKey: (e) => {
      const t = e as Extract<EntryInput, { trade: "tile" }>;
      return {
        columns: ["brand", "style", "color", "location_in_room"],
        values: [t.brand, t.style ?? null, t.color ?? null, t.location_in_room],
      };
    },
    rowColumns: (e) => {
      const t = e as Extract<EntryInput, { trade: "tile" }>;
      return {
        vendor: (t as { vendor?: string | null }).vendor ?? null,
        brand: t.brand,
        style: t.style ?? null,
        color: t.color ?? null,
        sku: t.sku ?? null,
        grout_color: t.grout_color ?? null,
        grout_sku: t.grout_sku ?? null,
        edge_profile: t.edge_profile ?? null,
        pattern: t.pattern ?? null,
        location_in_room: t.location_in_room,
        ...baseColumns(t),
      };
    },
  },
  paint: {
    kind: "paint",
    table: ENTRY_TABLE_BY_TRADE.paint,
    primaryKey: (e) => {
      const p = e as Extract<EntryInput, { trade: "paint" }>;
      return {
        columns: ["brand", "sku", "surface_application"],
        values: [p.brand, p.sku ?? null, p.surface_application ?? null],
      };
    },
    fallbackKey: (e) => {
      const p = e as Extract<EntryInput, { trade: "paint" }>;
      return {
        columns: ["brand", "color_name", "surface_application"],
        values: [p.brand, p.color_name, p.surface_application ?? null],
      };
    },
    rowColumns: (e) => {
      const p = e as Extract<EntryInput, { trade: "paint" }>;
      return {
        brand: p.brand,
        color_name: p.color_name,
        sku: p.sku ?? null,
        sheen: p.sheen ?? null,
        surface_application: p.surface_application ?? null,
        ...baseColumns(p),
      };
    },
  },
  carpet: {
    kind: "carpet",
    table: ENTRY_TABLE_BY_TRADE.carpet,
    primaryKey: (e) => {
      const c = e as Extract<EntryInput, { trade: "carpet" }>;
      return { columns: ["brand", "sku"], values: [c.brand, c.sku ?? null] };
    },
    fallbackKey: (e) => {
      const c = e as Extract<EntryInput, { trade: "carpet" }>;
      return {
        columns: ["brand", "style", "color"],
        values: [c.brand, c.style ?? null, c.color ?? null],
      };
    },
    rowColumns: (e) => {
      const c = e as Extract<EntryInput, { trade: "carpet" }>;
      return {
        brand: c.brand,
        style: c.style ?? null,
        color: c.color ?? null,
        sku: c.sku ?? null,
        pile: c.pile ?? null,
        ...baseColumns(c),
      };
    },
  },
  hardwood: {
    kind: "hardwood",
    table: ENTRY_TABLE_BY_TRADE.hardwood,
    primaryKey: (e) => {
      const h = e as Extract<EntryInput, { trade: "hardwood" }>;
      return { columns: ["brand", "sku"], values: [h.brand, h.sku ?? null] };
    },
    fallbackKey: (e) => {
      const h = e as Extract<EntryInput, { trade: "hardwood" }>;
      return {
        columns: ["brand", "species", "color"],
        values: [h.brand, h.species ?? null, h.color ?? null],
      };
    },
    rowColumns: (e) => {
      const h = e as Extract<EntryInput, { trade: "hardwood" }>;
      return {
        brand: h.brand,
        species: h.species ?? null,
        color: h.color ?? null,
        sku: h.sku ?? null,
        plank_width: h.plank_width ?? null,
        pattern: h.pattern ?? null,
        ...baseColumns(h),
      };
    },
  },
  cabinet: {
    kind: "cabinet",
    table: ENTRY_TABLE_BY_TRADE.cabinet,
    primaryKey: (e) => {
      const c = e as Extract<EntryInput, { trade: "cabinet" }>;
      return {
        columns: ["brand", "style", "color"],
        values: [c.brand, c.style ?? null, c.color ?? null],
      };
    },
    fallbackKey: (e) => {
      const c = e as Extract<EntryInput, { trade: "cabinet" }>;
      return {
        columns: ["brand", "style", "color"],
        values: [c.brand, c.style ?? null, c.color ?? null],
      };
    },
    rowColumns: (e) => {
      const c = e as Extract<EntryInput, { trade: "cabinet" }>;
      return {
        brand: c.brand,
        style: c.style ?? null,
        color: c.color ?? null,
        hardware: c.hardware ?? null,
        ...baseColumns(c),
      };
    },
  },
  countertop: {
    kind: "countertop",
    table: ENTRY_TABLE_BY_TRADE.countertop,
    primaryKey: (e) => {
      const c = e as Extract<EntryInput, { trade: "countertop" }>;
      return {
        columns: ["brand", "material", "color"],
        values: [c.brand, c.material, c.color ?? null],
      };
    },
    fallbackKey: (e) => {
      const c = e as Extract<EntryInput, { trade: "countertop" }>;
      return {
        columns: ["brand", "material", "color"],
        values: [c.brand, c.material, c.color ?? null],
      };
    },
    rowColumns: (e) => {
      const c = e as Extract<EntryInput, { trade: "countertop" }>;
      return {
        material: c.material,
        brand: c.brand,
        color: c.color ?? null,
        edge_profile: c.edge_profile ?? null,
        ...baseColumns(c),
      };
    },
  },
};

export function tradeMeta(kind: TradeKind): TradeMeta {
  return REGISTRY[kind];
}

export function isTradeKind(value: unknown): value is TradeKind {
  return typeof value === "string" && (TRADE_KINDS as readonly string[]).includes(value);
}

export function entrySchemaFor(kind: TradeKind) {
  return ENTRY_SCHEMA_BY_TRADE[kind];
}
