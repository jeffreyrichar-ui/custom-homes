CREATE TABLE `cabinet_entries` (
	`room_id` text NOT NULL,
	`brand` text NOT NULL,
	`style` text,
	`color` text,
	`hardware` text,
	`id` text PRIMARY KEY NOT NULL,
	`notes` text,
	`image_url` text,
	`allowance` real,
	`deadline` text,
	`status` text DEFAULT 'selected' NOT NULL,
	`is_new_entry` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`external_id` text,
	`external_source` text,
	`synced_at` text,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cabinet_entries_natural_key` ON `cabinet_entries` (`room_id`,`brand`,`style`,`color`);--> statement-breakpoint
CREATE TABLE `carpet_entries` (
	`room_id` text NOT NULL,
	`brand` text NOT NULL,
	`style` text,
	`color` text,
	`sku` text,
	`pile` text,
	`id` text PRIMARY KEY NOT NULL,
	`notes` text,
	`image_url` text,
	`allowance` real,
	`deadline` text,
	`status` text DEFAULT 'selected' NOT NULL,
	`is_new_entry` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`external_id` text,
	`external_source` text,
	`synced_at` text,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `carpet_entries_sku_key` ON `carpet_entries` (`room_id`,`brand`,`sku`) WHERE "carpet_entries"."sku" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `countertop_entries` (
	`room_id` text NOT NULL,
	`material` text NOT NULL,
	`brand` text NOT NULL,
	`color` text,
	`edge_profile` text,
	`id` text PRIMARY KEY NOT NULL,
	`notes` text,
	`image_url` text,
	`allowance` real,
	`deadline` text,
	`status` text DEFAULT 'selected' NOT NULL,
	`is_new_entry` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`external_id` text,
	`external_source` text,
	`synced_at` text,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `countertop_entries_natural_key` ON `countertop_entries` (`room_id`,`brand`,`material`,`color`);--> statement-breakpoint
CREATE TABLE `hardwood_entries` (
	`room_id` text NOT NULL,
	`brand` text NOT NULL,
	`species` text,
	`color` text,
	`sku` text,
	`plank_width` text,
	`pattern` text,
	`id` text PRIMARY KEY NOT NULL,
	`notes` text,
	`image_url` text,
	`allowance` real,
	`deadline` text,
	`status` text DEFAULT 'selected' NOT NULL,
	`is_new_entry` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`external_id` text,
	`external_source` text,
	`synced_at` text,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hardwood_entries_sku_key` ON `hardwood_entries` (`room_id`,`brand`,`sku`) WHERE "hardwood_entries"."sku" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `manufacturer_images` (
	`id` text PRIMARY KEY NOT NULL,
	`brand` text NOT NULL,
	`sku` text NOT NULL,
	`image_url` text NOT NULL,
	`scraped_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manufacturer_images_brand_sku_key` ON `manufacturer_images` (`brand`,`sku`);--> statement-breakpoint
CREATE TABLE `paint_entries` (
	`room_id` text NOT NULL,
	`brand` text NOT NULL,
	`color_name` text NOT NULL,
	`sku` text,
	`sheen` text,
	`surface_application` text,
	`id` text PRIMARY KEY NOT NULL,
	`notes` text,
	`image_url` text,
	`allowance` real,
	`deadline` text,
	`status` text DEFAULT 'selected' NOT NULL,
	`is_new_entry` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`external_id` text,
	`external_source` text,
	`synced_at` text,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paint_entries_sku_key` ON `paint_entries` (`room_id`,`brand`,`sku`,`surface_application`) WHERE "paint_entries"."sku" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`external_id` text,
	`external_source` text,
	`synced_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_external_idx` ON `projects` (`external_source`,`external_id`) WHERE "projects"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`room_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`external_id` text,
	`external_source` text,
	`synced_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_project_name_idx` ON `rooms` (`project_id`,`room_name`);--> statement-breakpoint
CREATE TABLE `tile_entries` (
	`room_id` text NOT NULL,
	`brand` text NOT NULL,
	`style` text,
	`color` text,
	`sku` text,
	`grout_color` text,
	`grout_sku` text,
	`edge_profile` text,
	`pattern` text,
	`location_in_room` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`notes` text,
	`image_url` text,
	`allowance` real,
	`deadline` text,
	`status` text DEFAULT 'selected' NOT NULL,
	`is_new_entry` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`external_id` text,
	`external_source` text,
	`synced_at` text,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tile_entries_sku_key` ON `tile_entries` (`room_id`,`brand`,`sku`,`location_in_room`) WHERE "tile_entries"."sku" IS NOT NULL;