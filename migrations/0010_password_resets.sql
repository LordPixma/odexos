ALTER TABLE `users` ADD `reset_token_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `reset_expires_at` text;--> statement-breakpoint
CREATE INDEX `users_reset_token_idx` ON `users` (`reset_token_hash`);