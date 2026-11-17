CREATE TABLE IF NOT EXISTS `training_focus` (
	`session_id` text PRIMARY KEY NOT NULL,
	`source_session_id` text NOT NULL,
	`dimension` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `training_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `training_focus_source_idx` ON `training_focus` (`source_session_id`);
