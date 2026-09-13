CREATE TABLE `allowance_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`child_id` text NOT NULL,
	`kind` text DEFAULT 'weekly' NOT NULL,
	`amount_cents` integer NOT NULL,
	`week_start` text,
	`base_cents` integer,
	`merit_count` integer,
	`demerit_count` integer,
	`note` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `allowance_ledger_child_idx` ON `allowance_ledger` (`child_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `allowance_ledger_weekly_unique` ON `allowance_ledger` (`child_id`,`kind`,`week_start`);--> statement-breakpoint
CREATE TABLE `balance_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`child_id` text NOT NULL,
	`week_start` text NOT NULL,
	`balance_cents` integer NOT NULL,
	`note` text,
	`recorded_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `balance_checks_child_week_unique` ON `balance_checks` (`child_id`,`week_start`);--> statement-breakpoint
CREATE TABLE `merits` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`child_id` text NOT NULL,
	`value` integer NOT NULL,
	`note` text NOT NULL,
	`week_start` text NOT NULL,
	`issued_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `merits_child_week_idx` ON `merits` (`child_id`,`week_start`);--> statement-breakpoint
CREATE INDEX `merits_family_idx` ON `merits` (`family_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `room_inspections` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`child_id` text NOT NULL,
	`week_start` text NOT NULL,
	`rating` integer NOT NULL,
	`note` text,
	`inspected_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inspected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_inspections_child_week_unique` ON `room_inspections` (`child_id`,`week_start`);--> statement-breakpoint
CREATE TABLE `savings_pots` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`child_id` text NOT NULL,
	`name` text NOT NULL,
	`balance_cents` integer DEFAULT 0 NOT NULL,
	`target_cents` integer,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `savings_pots_child_idx` ON `savings_pots` (`child_id`);--> statement-breakpoint
ALTER TABLE `families` ADD `merit_value_cents` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `families` ADD `last_allowance_week` text;--> statement-breakpoint
ALTER TABLE `users` ADD `allowance_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- The 'adult' role is now 'parent'. SQLite keeps the enum as plain text with no
-- constraint, so drizzle-kit sees no schema change and existing rows need
-- moving by hand — otherwise an adult silently loses their parent powers.
UPDATE `users` SET `role` = 'parent' WHERE `role` = 'adult';
