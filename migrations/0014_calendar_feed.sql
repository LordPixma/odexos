ALTER TABLE `families` ADD `calendar_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `families_calendar_token_unique` ON `families` (`calendar_token`);