CREATE TABLE `category_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`pattern` text NOT NULL,
	`category` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `category_rules_family_idx` ON `category_rules` (`family_id`);