CREATE TABLE `chore_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`chore_id` text NOT NULL,
	`family_id` text NOT NULL,
	`member_id` text,
	`for_date` text NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`completed_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`chore_id`) REFERENCES `chores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chore_completions_chore_idx` ON `chore_completions` (`chore_id`);--> statement-breakpoint
CREATE INDEX `chore_completions_family_idx` ON `chore_completions` (`family_id`,`completed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `chore_completions_occurrence_unique` ON `chore_completions` (`chore_id`,`for_date`);--> statement-breakpoint
CREATE TABLE `chores` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`assigned_to` text,
	`cadence` text DEFAULT 'weekly' NOT NULL,
	`due_date` text NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`rotate` integer DEFAULT false NOT NULL,
	`streak` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chores_family_due_idx` ON `chores` (`family_id`,`due_date`);