CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`sequence` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `training_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_session_sequence_uq` ON `messages` (`session_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `training_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`report_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `training_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `training_reports_session_id_unique` ON `training_reports` (`session_id`);--> statement-breakpoint
CREATE TABLE `training_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`scenario_config` text NOT NULL,
	`hidden_customer_profile` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `training_sessions_owner_idx` ON `training_sessions` (`owner_id`);