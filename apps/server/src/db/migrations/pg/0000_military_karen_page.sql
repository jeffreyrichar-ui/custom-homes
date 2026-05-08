CREATE TABLE IF NOT EXISTS "cabinet_entries" (
	"room_id" uuid NOT NULL,
	"brand" text NOT NULL,
	"style" text,
	"color" text,
	"hardware" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notes" text,
	"image_url" text,
	"allowance" numeric,
	"deadline" timestamp with time zone,
	"status" text DEFAULT 'selected' NOT NULL,
	"is_new_entry" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_id" text,
	"external_source" text,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "carpet_entries" (
	"room_id" uuid NOT NULL,
	"brand" text NOT NULL,
	"style" text,
	"color" text,
	"sku" text,
	"pile" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notes" text,
	"image_url" text,
	"allowance" numeric,
	"deadline" timestamp with time zone,
	"status" text DEFAULT 'selected' NOT NULL,
	"is_new_entry" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_id" text,
	"external_source" text,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "countertop_entries" (
	"room_id" uuid NOT NULL,
	"material" text NOT NULL,
	"brand" text NOT NULL,
	"color" text,
	"edge_profile" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notes" text,
	"image_url" text,
	"allowance" numeric,
	"deadline" timestamp with time zone,
	"status" text DEFAULT 'selected' NOT NULL,
	"is_new_entry" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_id" text,
	"external_source" text,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hardwood_entries" (
	"room_id" uuid NOT NULL,
	"brand" text NOT NULL,
	"species" text,
	"color" text,
	"sku" text,
	"plank_width" text,
	"pattern" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notes" text,
	"image_url" text,
	"allowance" numeric,
	"deadline" timestamp with time zone,
	"status" text DEFAULT 'selected' NOT NULL,
	"is_new_entry" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_id" text,
	"external_source" text,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "manufacturer_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" text NOT NULL,
	"sku" text NOT NULL,
	"image_url" text NOT NULL,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "paint_entries" (
	"room_id" uuid NOT NULL,
	"brand" text NOT NULL,
	"color_name" text NOT NULL,
	"sku" text,
	"sheen" text,
	"surface_application" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notes" text,
	"image_url" text,
	"allowance" numeric,
	"deadline" timestamp with time zone,
	"status" text DEFAULT 'selected' NOT NULL,
	"is_new_entry" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_id" text,
	"external_source" text,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_id" text,
	"external_source" text,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"room_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_id" text,
	"external_source" text,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tile_entries" (
	"room_id" uuid NOT NULL,
	"brand" text NOT NULL,
	"style" text,
	"color" text,
	"sku" text,
	"grout_color" text,
	"grout_sku" text,
	"edge_profile" text,
	"pattern" text,
	"location_in_room" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notes" text,
	"image_url" text,
	"allowance" numeric,
	"deadline" timestamp with time zone,
	"status" text DEFAULT 'selected' NOT NULL,
	"is_new_entry" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_id" text,
	"external_source" text,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cabinet_entries" ADD CONSTRAINT "cabinet_entries_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "carpet_entries" ADD CONSTRAINT "carpet_entries_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "countertop_entries" ADD CONSTRAINT "countertop_entries_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hardwood_entries" ADD CONSTRAINT "hardwood_entries_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paint_entries" ADD CONSTRAINT "paint_entries_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rooms" ADD CONSTRAINT "rooms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tile_entries" ADD CONSTRAINT "tile_entries_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cabinet_entries_natural_key" ON "cabinet_entries" USING btree ("room_id","brand","style","color");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "carpet_entries_sku_key" ON "carpet_entries" USING btree ("room_id","brand","sku") WHERE "carpet_entries"."sku" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "countertop_entries_natural_key" ON "countertop_entries" USING btree ("room_id","brand","material","color");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hardwood_entries_sku_key" ON "hardwood_entries" USING btree ("room_id","brand","sku") WHERE "hardwood_entries"."sku" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "manufacturer_images_brand_sku_key" ON "manufacturer_images" USING btree ("brand","sku");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "paint_entries_sku_key" ON "paint_entries" USING btree ("room_id","brand","sku","surface_application") WHERE "paint_entries"."sku" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "projects_external_idx" ON "projects" USING btree ("external_source","external_id") WHERE "projects"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_project_name_idx" ON "rooms" USING btree ("project_id","room_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tile_entries_sku_key" ON "tile_entries" USING btree ("room_id","brand","sku","location_in_room") WHERE "tile_entries"."sku" IS NOT NULL;