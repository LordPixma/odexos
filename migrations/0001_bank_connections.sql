CREATE TABLE `bank_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`provider` text DEFAULT 'truelayer' NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`access_token_enc` text,
	`refresh_token_enc` text,
	`expires_at` text,
	`last_synced_at` text,
	`last_error` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bank_connections_family_idx` ON `bank_connections` (`family_id`);--> statement-breakpoint
CREATE TABLE `bank_oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `connection_id` text REFERENCES bank_connections(id);--> statement-breakpoint
CREATE INDEX `accounts_connection_idx` ON `accounts` (`connection_id`);