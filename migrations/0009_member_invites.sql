ALTER TABLE `users` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `invite_token_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `invite_expires_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `invited_by` text;--> statement-breakpoint
ALTER TABLE `users` ADD `invited_at` text;--> statement-breakpoint
CREATE INDEX `users_invite_token_idx` ON `users` (`invite_token_hash`);