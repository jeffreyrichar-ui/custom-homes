CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`summary` text,
	`error` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text
);
