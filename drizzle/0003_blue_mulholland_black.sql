CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`model` text NOT NULL,
	`provider` text NOT NULL,
	`operation` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`reserved_tokens` integer NOT NULL,
	`tokens` integer,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`cost` real,
	`outcome` text
);
--> statement-breakpoint
CREATE INDEX `ai_usage_owner_time_idx` ON `ai_usage` (`owner_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_time_idx` ON `ai_usage` (`started_at`);