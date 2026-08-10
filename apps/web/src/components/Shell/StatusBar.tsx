import { useTranslation } from "react-i18next";

import { useEditor } from "@/store/editor";

/**
 * Statusleiste: welcher Stand offen ist, woher er kommt, wie gross er ist, und wie viele
 * Constraints offen sind. Der Befundzaehler ist zugleich der Weg ins Befundpanel,
 * `data-issues-toggle` bleibt deshalb erhalten.
 */
/**
 * Trenner zwischen zwei Angaben der Statusleiste.
 *
 * Eine Haarlinie, kein Mittelpunkt: der Punkt stand bis zum 10.08.2026 **im Text** der
 * ersten Angabe, war deshalb vor "8 Anhaenge" schlicht nicht da, und bei dieser
 * Schriftgroesse in einer Monoschrift ohnehin kaum von einem Satzzeichen zu unterscheiden.
 * Als eigenes Element steht er zwischen allen Angaben gleich und ist als Trenner zu
 * erkennen.
 */
function Trenner() {
  return <span aria-hidden className="h-3.5 w-px shrink-0 bg-border" />;
}

export function StatusBar() {
  const { t, i18n } = useTranslation();

  const model = useEditor((state) => state.model);
  const meta = useEditor((state) => state.meta);
  const issues = useEditor((state) => state.issues);
  const pruefung = useEditor((state) => state.pruefung);
  const anhaengeBereit = useEditor((state) => state.anhaengeBereit);
  const issuePanelOpen = useEditor((state) => state.issuePanelOpen);
  const setIssuePanelOpen = useEditor((state) => state.setIssuePanelOpen);

  const dirty = useEditor((state) => state.dirty);

  const constraints = issues.filter((issue) => issue.severity === "constraint").length;

  // Der Projektname ohne Endung, wie in der Vorlage.
  const projekt = meta ? meta.fileName.replace(/\.(json|xml|aasx)$/i, "") : null;
  // Allein `dirty` sagt, ob etwas aussteht. Der Speichern-Knopf liest dasselbe Feld,
  // sonst leuchtet hier ein Punkt, waehrend der Knopf sich fuer fertig haelt.
  const gespeichert = !dirty;
  const heute = new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }).format(new Date());

  return (
    <footer className="flex h-(--h-statusbar) shrink-0 items-center gap-3 border-t border-border bg-muted px-3.5 font-mono text-xs text-mono-foreground">
      {/*
        Fassung, Datum und Projektname wie in der Vorlage. Format, Metamodell und Knotenzahl
        sind auf Wunsch weg. Was bleibt, ist keine Wiederholung der Kopfzeile: die
        Anhangsanzeigen warnen vor einem unvollstaendigen AASX-Export, und der Befund-Knopf
        ist der Weg ins Befundpanel.
      */}
      <span data-numeric>{t("status.fassung", { nummer: __APP_VERSION__ })}</span>
      <Trenner />
      <span data-numeric>{heute}</span>
      {projekt ? <Trenner /> : null}
      {projekt ? (
        <span className="flex min-w-0 items-center gap-2">
          {/*
            Der Punkt ist die einzige Anzeige, dass etwas offen ist, seit der
            "Gespeichert"-Chip aus der Kopfzeile weg ist. Ein Wort waere hier eine vierte
            Angabe zwischen den Trennpunkten und wuerde die Zeile unruhig machen.
          */}
          {gespeichert ? null : (
            <span
              className="size-[7px] shrink-0 rounded-full bg-warning"
              aria-label={t("status.ungespeichert")}
            />
          )}
          {/* min-w-0, sonst greift truncate nicht: ein Flex-Kind schrumpft von sich aus
              nicht unter seine Inhaltsbreite. */}
          <span className="min-w-0 truncate text-foreground" title={projekt}>
            {projekt}
          </span>
        </span>
      ) : null}

      {meta ? (
        <>
          {meta.attachments.length > 0 ? (
            <>
              <Trenner />
              <span data-numeric>{t("status.anhaenge", { count: meta.attachments.length })}</span>
            </>
          ) : null}
          {!anhaengeBereit ? (
            <>
              <Trenner />
              <span>{t("status.anhaengeLaden")}</span>
            </>
          ) : null}
        </>
      ) : (
        <>
          <Trenner />
          <span>{t("status.keineDatei")}</span>
        </>
      )}

      <span className="ml-auto flex items-center gap-3">
        <button
          type="button"
          data-issues-toggle
          disabled={!model}
          aria-pressed={issuePanelOpen}
          // Die Zaehler aendern sich nach jeder Pruefung. Ohne lebenden Bereich erfaehrt
          // niemand davon, der nicht gerade hinsieht.
          aria-live="polite"
          // Der Knopf traegt immer einen Namen. Ohne die Warnungszahl war er bei null
          // Constraints und offenen Warnungen leer, und ein leerer Knopf ist fuer einen
          // Bildschirmleser namenlos.
          aria-label={t("befund.titel")}
          onClick={() => setIssuePanelOpen(!issuePanelOpen)}
          className="flex items-center gap-2 rounded-xs px-1 hover:bg-accent disabled:hover:bg-transparent"
        >
          {constraints > 0 ? (
            <>
              <span
                aria-hidden
                className="size-[7px] animate-[axon-atem_2.4s_ease-in-out_infinite] rounded-full bg-warning"
              />
              <span className="font-semibold text-warning-text" data-numeric>
                {t("status.constraints", { count: constraints })}
              </span>
            </>
          ) : null}
          {model && constraints === 0 && pruefung === "ruht" ? (
            <span>{issues.length === 0 ? t("status.keineBefunde") : t("befund.titel")}</span>
          ) : null}
          {pruefung === "laeuft" ? <span>{t("status.prueft")}</span> : null}
        </button>
      </span>
    </footer>
  );
}
