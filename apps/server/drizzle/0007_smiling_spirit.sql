-- Einstellungen je Besitzer (Sicherheitsaudit 11.08.2026, mittlerer Befund).
--
-- Die alte Tabelle hat keine owner_id. Die bestehenden globalen Zeilen werden bewusst
-- **nicht** uebernommen: der einzige Inhalt war der Assistenten-Schluessel, und der wird im
-- Zuge des Audits ohnehin rotiert. Der Nutzer traegt ihn danach einmal neu ein, dann liegt
-- er unter seiner eigenen owner_id.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_einstellungen` (
	`owner_id` text DEFAULT '' NOT NULL,
	`schluessel` text NOT NULL,
	`wert` text NOT NULL,
	`aktualisiert` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `schluessel`)
);
--> statement-breakpoint
DROP TABLE `einstellungen`;--> statement-breakpoint
ALTER TABLE `__new_einstellungen` RENAME TO `einstellungen`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
