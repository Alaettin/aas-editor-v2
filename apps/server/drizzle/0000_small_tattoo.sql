CREATE TABLE `concept_descriptions` (
	`row_id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`id_short` text,
	`sort_index` integer NOT NULL,
	`json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_concept_descriptions_project` ON `concept_descriptions` (`project_id`,`sort_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_concept_descriptions_id` ON `concept_descriptions` (`project_id`,`id`) WHERE id <> '';--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`storage_path` text NOT NULL,
	`role` text DEFAULT 'anhang' NOT NULL,
	`referenced` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_files_path` ON `files` (`project_id`,`path`);--> statement-breakpoint
CREATE INDEX `idx_files_project` ON `files` (`project_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `project_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`revision` integer NOT NULL,
	`label` text,
	`reason` text DEFAULT 'manuell' NOT NULL,
	`snapshot` blob NOT NULL,
	`snapshot_bytes` integer NOT NULL,
	`node_count` integer NOT NULL,
	`metamodel_version` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_versions_project` ON `project_versions` (`project_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`metamodel_version` text DEFAULT '3.1' NOT NULL,
	`source_format` text DEFAULT 'json' NOT NULL,
	`environment_data` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`node_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_projects_created` ON `projects` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `shells` (
	`row_id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`id_short` text,
	`sort_index` integer NOT NULL,
	`json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_shells_project` ON `shells` (`project_id`,`sort_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_shells_id` ON `shells` (`project_id`,`id`) WHERE id <> '';--> statement-breakpoint
CREATE TABLE `submodels` (
	`row_id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`id_short` text,
	`sort_index` integer NOT NULL,
	`json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_submodels_project` ON `submodels` (`project_id`,`sort_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_submodels_id` ON `submodels` (`project_id`,`id`) WHERE id <> '';