CREATE TABLE `account_bookmarked_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`player_tag` text NOT NULL,
	`player_name` text NOT NULL,
	`added_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_bookmarks_account_tag` ON `account_bookmarked_players` (`account_id`,`player_tag`);--> statement-breakpoint
CREATE INDEX `idx_account_bookmarks_account_id` ON `account_bookmarked_players` (`account_id`,`id`);--> statement-breakpoint
PRAGMA optimize;
