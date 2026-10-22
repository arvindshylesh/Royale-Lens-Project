CREATE TABLE `player_trophy_bests` (
	`player_tag` text PRIMARY KEY NOT NULL,
	`best_trophies` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
