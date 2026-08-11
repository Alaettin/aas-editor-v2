CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_repositories_owner` ON `repositories` (`owner_id`);--> statement-breakpoint
CREATE TABLE `repository_submodels` (
	`row_id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`id` text NOT NULL,
	`id_short` text,
	`json` text NOT NULL,
	`herkunft_projekt_id` text NOT NULL,
	`herkunft_projekt_name` text NOT NULL,
	`uebernommen_am` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_repository_submodels_id` ON `repository_submodels` (`repository_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_repository_submodels` ON `repository_submodels` (`repository_id`,`id`,`row_id`);