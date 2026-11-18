CREATE TABLE `billing_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`plan` text NOT NULL,
	`state` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_order_external_idx` ON `billing_orders` (`provider`,`external_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`state` text NOT NULL,
	`valid_until` integer NOT NULL
);
