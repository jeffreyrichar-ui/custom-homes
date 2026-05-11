import { sql } from "drizzle-orm";
import {
  boolean,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const btSync = {
  external_id: text("external_id"),
  external_source: text("external_source"),
  synced_at: timestamp("synced_at", { withTimezone: true, mode: "string" }),
};

const entryCommon = {
  id: uuid("id").primaryKey().defaultRandom(),
  notes: text("notes"),
  image_url: text("image_url"),
  allowance: numeric("allowance"),
  deadline: timestamp("deadline", { withTimezone: true, mode: "string" }),
  status: text("status").notNull().default("selected"),
  is_new_entry: boolean("is_new_entry").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  ...btSync,
};

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    address: text("address"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    ...btSync,
  },
  (t) => ({
    externalIdx: uniqueIndex("projects_external_idx")
      .on(t.external_source, t.external_id)
      .where(sql`${t.external_id} IS NOT NULL`),
  }),
);

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    room_name: text("room_name").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    ...btSync,
  },
  (t) => ({
    naturalKey: uniqueIndex("rooms_project_name_idx").on(t.project_id, t.room_name),
  }),
);

export const tile_entries = pgTable(
  "tile_entries",
  {
    room_id: uuid("room_id")
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

export const paint_entries = pgTable(
  "paint_entries",
  {
    room_id: uuid("room_id")
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

export const carpet_entries = pgTable(
  "carpet_entries",
  {
    room_id: uuid("room_id")
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

export const hardwood_entries = pgTable(
  "hardwood_entries",
  {
    room_id: uuid("room_id")
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

export const cabinet_entries = pgTable(
  "cabinet_entries",
  {
    room_id: uuid("room_id")
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

export const countertop_entries = pgTable(
  "countertop_entries",
  {
    room_id: uuid("room_id")
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

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    password_hash: text("password_hash").notNull(),
    name: text("name"),
    role: text("role").notNull().default("editor"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailKey: uniqueIndex("users_email_key").on(t.email),
  }),
);

export const manufacturer_images = pgTable(
  "manufacturer_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brand: text("brand").notNull(),
    sku: text("sku").notNull(),
    image_url: text("image_url").notNull(),
    scraped_at: timestamp("scraped_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    brandSkuKey: uniqueIndex("manufacturer_images_brand_sku_key").on(t.brand, t.sku),
  }),
);
