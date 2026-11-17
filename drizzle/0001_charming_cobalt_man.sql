CREATE TABLE IF NOT EXISTS `saved_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`product` text NOT NULL,
	`description` text NOT NULL,
	`identity` text NOT NULL,
	`personality` text NOT NULL,
	`difficulty` text NOT NULL,
	`goal` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `saved_scenarios_owner_idx` ON `saved_scenarios` (`owner_id`);
