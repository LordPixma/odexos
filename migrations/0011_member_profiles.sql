CREATE TABLE `member_avatars` (
	`user_id` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `nickname` text;--> statement-breakpoint
ALTER TABLE `users` ADD `pronouns` text;--> statement-breakpoint
ALTER TABLE `users` ADD `birthday` text;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_budget_alerts` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_weekly_digest` integer DEFAULT true NOT NULL;