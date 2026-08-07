import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

/**
 * Ablage nach Plan Abschnitt 9.
 *
 * Der entscheidende Zuschnitt: Identifiables liegen einzeln, adressierbar ueber ihre
 * fachliche `id`, nicht gemeinsam in einem Blob. Nur so kann der Editor spaeter ein
 * einzelnes Submodel unter seiner id ausliefern (IDTA-01002), ohne die Persistenz neu
 * zu schreiben.
 *
 * Keine `users`-Tabelle: die Anmeldung kommt aus der .env (Plan Abschnitt 9).
 * Zeitstempel durchgaengig als Millisekunden, damit DB und JSON dieselbe Zahl fuehren.
 */

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    metamodelVersion: text("metamodel_version").notNull().default("3.1"),
    sourceFormat: text("source_format").notNull().default("json"),
    /**
     * Die Felder des Environment-Wurzelknotens ohne die drei Kind-Slots. Heute meist "{}",
     * aber ohne diese Spalte waere der Rundlauf verlustbehaftet, sobald das Metamodell der
     * Wurzel ein Feld gibt.
     */
    environmentData: text("environment_data").notNull().default("{}"),
    /**
     * Zaehler der Schreibvorgaenge. Seit dem 06.08.2026 **kein** optimistisches Sperren
     * mehr: Speichern ueberschreibt. Die Zahl bleibt, weil die gemerkte Befundzahl
     * darueber ungueltig wird.
     */
    revision: integer("revision").notNull().default(1),
    nodeCount: integer("node_count").notNull().default(0),
    /**
     * Zahl der Befunde (Constraint-Verstoesse und Datenwarnungen) und die Fassung, fuer die
     * sie gilt. Beide leer heisst "noch nie gerechnet", und das ist etwas anderes als null
     * Befunde. Gerechnet wird beim ersten Abruf der Uebersicht, danach nur wieder, wenn die
     * Fassung weitergezaehlt hat.
     */
    issueCount: integer("issue_count"),
    issueRevision: integer("issue_revision"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_projects_created").on(t.createdAt, t.id),
    /**
     * Der Name ist die einzige Kennung, die ein Mensch im Einstieg sieht. Zwei Projekte
     * gleichen Namens sind dort nicht auseinanderzuhalten, deshalb steht die
     * Eindeutigkeit in der Datenbank und nicht nur im Dialog.
     */
    uniqueIndex("uq_projects_name").on(t.name),
  ],
);

/**
 * Die drei Identifiable-Tabellen sind formgleich. Eindeutigkeit ausschliesslich auf `id`,
 * nie auf `idShort`: AASd-022 gilt nur fuer non-identifiable Referables, ein Projekt darf
 * mehrere Submodels mit gleichem idShort und verschiedener id enthalten.
 * Der Unique-Index ist partiell, weil ein im Editor noch leeres Feld erlaubt bleiben muss.
 */
function identifiableTable(name: string) {
  return sqliteTable(
    name,
    {
      rowId: text("row_id").primaryKey(),
      projectId: text("project_id")
        .notNull()
        .references((): AnySQLiteColumn => projects.id, { onDelete: "cascade" }),
      id: text("id").notNull(),
      idShort: text("id_short"),
      sortIndex: integer("sort_index").notNull(),
      json: text("json").notNull(),
      updatedAt: integer("updated_at").notNull(),
    },
    (t) => [
      index(`idx_${name}_project`).on(t.projectId, t.sortIndex),
      uniqueIndex(`uq_${name}_id`)
        .on(t.projectId, t.id)
        .where(sql`id <> ''`),
    ],
  );
}

export const shells = identifiableTable("shells");
export const submodels = identifiableTable("submodels");
export const conceptDescriptions = identifiableTable("concept_descriptions");

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Paketpfad aus dem AASX, so wie ihn das File-Element traegt */
    path: text("path").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    /** relativ zu DATA_DIR */
    storagePath: text("storage_path").notNull(),
    /** anhang | thumbnail */
    role: text("role").notNull().default("anhang"),
    /**
     * Ob ein File-Element im zuletzt gespeicherten Stand auf diesen Pfad zeigt.
     * Nicht referenzierte Anhaenge werden nicht sofort geloescht: ein Element kann im
     * naechsten Schritt wieder darauf zeigen.
     */
    referenced: integer("referenced", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("uq_files_path").on(t.projectId, t.path),
    index("idx_files_project").on(t.projectId, t.createdAt, t.id),
  ],
);

/**
 * Einstellungen, die nicht aus der .env kommen koennen, weil der Nutzer sie zur Laufzeit
 * setzt. Heute genau zwei Zeilen: der OpenAI-Schluessel des Assistenten und das gewaehlte
 * Modell.
 *
 * Der Schluessel liegt **verschluesselt** (`services/geheimnis.ts`) und verlaesst die
 * Tabelle nur in Richtung OpenAI, nie in Richtung Browser. Eine eigene Spalte je
 * Einstellung waere ehrlicher getypt, aber jede neue Einstellung braeuchte dann eine
 * Migration; bei zwei Werten ohne Abfragen darauf wiegt das schwerer.
 */
export const einstellungen = sqliteTable("einstellungen", {
  schluessel: text("schluessel").primaryKey(),
  wert: text("wert").notNull(),
  aktualisiert: integer("aktualisiert").notNull(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type IdentifiableRow = typeof submodels.$inferSelect;
export type FileRow = typeof files.$inferSelect;
