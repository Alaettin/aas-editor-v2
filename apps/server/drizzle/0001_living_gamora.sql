-- Bestehende Datenbanken koennen doppelte Projektnamen enthalten, dort scheitert das
-- Anlegen des Unique-Index. Dubletten bekommen deshalb vorher einen Zusatz, und zwar den
-- Anfang ihrer eigenen Kennung: der ist eine UUID und kann mit keinem zweiten Namen
-- kollidieren, ein blosses " (2)" schon.
UPDATE `projects`
SET `name` = `name` || ' (' || substr(`id`, 1, 8) || ')'
WHERE `id` IN (
  SELECT `id` FROM (
    SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `name` ORDER BY `created_at`, `id`) AS nr
    FROM `projects`
  ) WHERE nr > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_projects_name` ON `projects` (`name`);
