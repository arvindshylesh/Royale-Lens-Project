DROP TABLE `upgrade_queue_items`;--> statement-breakpoint
DROP TABLE `upgrade_queue_settings`;--> statement-breakpoint
ALTER TABLE `accounts` DROP COLUMN `legacy_queue_migrated`;