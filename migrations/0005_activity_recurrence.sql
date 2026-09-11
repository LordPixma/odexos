ALTER TABLE `activities` ADD `recurrence` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `activities` ADD `recurrence_until` text;