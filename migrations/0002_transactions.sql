CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`account_id` text NOT NULL,
	`connection_id` text,
	`external_ref` text NOT NULL,
	`description` text NOT NULL,
	`merchant` text,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`direction` text DEFAULT 'debit' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`category_locked` integer DEFAULT false NOT NULL,
	`raw_category` text,
	`date` text NOT NULL,
	`booked_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `bank_connections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `transactions_family_date_idx` ON `transactions` (`family_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_account_ref_unique` ON `transactions` (`account_id`,`external_ref`);