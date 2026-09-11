CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`category` text,
	`month` text,
	`dedupe_key` text NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_family_idx` ON `notifications` (`family_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_family_dedupe_unique` ON `notifications` (`family_id`,`dedupe_key`);--> statement-breakpoint
ALTER TABLE `families` ADD `alert_emails` integer DEFAULT true NOT NULL;