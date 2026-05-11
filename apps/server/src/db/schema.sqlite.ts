import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const uuidPk = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const btSync = {
  external_id: text("external_id"),
  external_source: text("external_source"),
  synced_at: text("synced_at"),
};

const entryCommon = {
  id: uuidPk(),
  notes: text("notes"),
  image_url: text("image_url"),
  allowance: real("allowance"),
  deadline: text("deadline"),
  status: text("status").notNull().default("selected"),
  is_new_entry: integer("is_new_entry", { mode: "boolean" })
    .notNull()
    .default(false),
  created_at: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  ...btSync,
};

export const projects = sqliteTable(
  "projects",
  {
    id: uuidPk(),
    name: text("name").notNull(),
    address: text("address"),
    created_at: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    ...btSync,
  },
  (t) => ({
    externalIdx: uniqueIndex("projects_external_idx")
      .on(t.external_source, t.external_id)
      .where(sql`${t.external_id} IS NOT NULL`),
  }),
);

export const rooms = sqliteTable(
  "rooms",
  {
    id: uuidPk(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    room_name: text("room_name").notNull(),
    created_at: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    ...btSync,
  },
  (t) => ({
    naturalKey: uniqueIndex("rooms_project_name_idx").on(t.project_id, t.room_name),
  }),
);

export const tile_entries = sqliteTable(
  "tile_entries",
  {
    room_id: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    brand: text("brand").notNull(),
    style: text("style"),
    color: text("color"),
    sku: text("sku"),
    grout_color: text("grout_color"),
    grout_sku: text("grout_sku"),
    edge_profile: text("edge_profile"),
    pattern: text("pattern"),
    location_in_room: text("location_in_room").notNull(),
    ...entryCommon,
  },
  (t) => ({
    skuKey: uniqueIndex("tile_entries_sku_key")
      .on(t.room_id, t.brand, t.sku, t.location_in_room)
      .where(sql`${t.sku} IS NOT NULL`),
  }),
);

export const paint_entries = sqliteTable(
  "paint_entries",
  {
    room_id: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    brand: text("brand").notNull(),
    color_name: text("color_name").notNull(),
    sku: text("sku"),
    sheen: text("sheen"),
    surface_application: text("surface_application"),
    ...entryCommon,
  },
  (t) => ({
    skuKey: uniqueIndex("paint_entries_sku_key")
      .on(t.room_id, t.brand, t.sku, t.surface_application)
      .where(sql`${t.sku} IS NOT NULL`),
  }),
);

export const carpet_entries = sqliteTable(
  "carpet_entries",
  {
    room_id: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    brand: text("brand").notNull(),
    style: text("style"),
    color: text("color"),
    sku: text("sku"),
    pile: text("pile"),
    ...entryCommon,
  },
  (t) => ({
    skuKey: uniqueIndex("carpet_entries_sku_key")
      .on(t.room_id, t.brand, t.sku)
      .where(sql`${t.sku} IS NOT NULL`),
  }),
);

export const hardwood_entries = sqliteTable(
  "hardwood_entries",
  {
    room_id: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    brand: text("brand").notNull(),
    species: text("species"),
    color: text("color"),
    sku: text("sku"),
    plank_width: text("plank_width"),
    pattern: text("pattern"),
    ...entryCommon,
  },
  (t) => ({
    skuKey: uniqueIndex("hardwood_entries_sku_key")
      .on(t.room_id, t.brand, t.sku)
      .where(sql`${t.sku} IS NOT NULL`),
  }),
);

export const cabinet_entries = sqliteTable(
  "cabinet_entries",
  {
    room_id: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    brand: text("brand").notNull(),
    style: text("style"),
    color: text("color"),
    hardware: text("hardware"),
    ...entryCommon,
  },
  (t) => ({
    naturalKey: uniqueIndex("cabinet_entries_natural_key").on(
      t.room_id,
      t.brand,
      t.style,
      t.color,
    ),
  }),
);

export const countertop_entries = sqliteTable(
  "countertop_entries",
  {
    room_id: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    material: text("material").notNull(),
    brand: text("brand").notNull(),
    color: text("color"),
    edge_profile: text("edge_profile"),
    ...entryCommon,
  },
  (t) => ({
    naturalKey: uniqueIndex("countertop_entries_natural_key").on(
      t.room_id,
      t.brand,
      t.material,
      t.color,
    ),
  }),
);

export const users = sqliteTable(
  "users",
  {
    id: uuidPk(),
    email: text("email").notNull(),
    password_hash: text("password_hash").notNull(),
    name: text("name"),
    role: text("role").notNull().default("editor"),
    created_at: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    emailKey: uniqueIndex("users_email_key").on(t.email),
  }),
);

export const manufacturer_images = sqliteTable(
  "manufacturer_images",
  {
    id: uuidPk(),
    brand: text("brand").notNull(),
    sku: text("sku").notNull(),
    image_url: text("image_url").notNull(),
    scraped_at: text("scraped_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    brandSkuKey: uniqueIndex("manufacturer_images_brand_sku_key").on(t.brand, t.sku),
  }),
);
