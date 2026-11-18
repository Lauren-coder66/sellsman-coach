CREATE TABLE `voice_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`session_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`seconds` integer NOT NULL,
	`transcript` text,
	`ended_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `training_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `voice_attempts_owner_time_idx` ON `voice_attempts` (`owner_id`,`started_at`);