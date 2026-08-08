DROP INDEX `uq_projects_name`;--> statement-breakpoint
ALTER TABLE `projects` ADD `owner_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_projects_owner` ON `projects` (`owner_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_projects_owner_name` ON `projects` (`owner_id`,`name`);