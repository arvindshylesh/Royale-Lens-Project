CREATE TABLE `upgrade_queue_items` (
	`player_tag` text NOT NULL,
	`card_id` integer NOT NULL,
	`rarity` text NOT NULL,
	`position` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`player_tag`, `card_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_upgrade_queue_player_rarity_position` ON `upgrade_queue_items` (`player_tag`,`rarity`,`position`);--> statement-breakpoint
CREATE TABLE `upgrade_queue_settings` (
	`player_tag` text NOT NULL,
	`rarity` text NOT NULL,
	`capacity` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`player_tag`, `rarity`)
);
