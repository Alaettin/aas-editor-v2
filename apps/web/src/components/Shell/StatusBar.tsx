import { useTranslation } from "react-i18next";

import { nodeCount, useEditor } from "@/store/editor";

/**
 * Statusleiste: woher der Stand kommt, wie gross er ist, und wie viele Befunde offen
 * sind. Der Befundzaehler ist zugleich der Weg ins Befundpanel, `data-issues-toggle`
 * bleibt deshalb erhalten.
 */
export function StatusBar() {
  const { t } = useTranslation();

  const model = useEditor((state) => state.model);
  const meta = useEditor((state) => state.meta);
  const issues = useEditor((state) => state.issues);
  const view = useEditor((state) => state.view);
  const graphZoom = useEditor((state) => state.graphZoom);
  const anhaengeBereit = useEditor((state) => state.anhaengeBereit);
  const issuePanelOpen = useEditor((state) => state.issuePanelOpen);
  const setIssuePanelOpen = useEditor((state) => state.setIssuePanelOpen);

  const constraints = issues.filter((issue) => issue.severity === "constraint").length;
  const warnungen = issues.length - constraints;

  return (
    <footer className="flex h-(--h-statusbar) shrink-0 items-center gap-3 border-t border-border bg-card px-3.5 font-mono text-xs text-mono-foreground">
      {meta ? (
        <>
          <span>
            {meta.format.toUpperCase()} · {t("status.metamodell")}{" "}
            {meta.sourceVersion === "unbekannt" ? t("status.versionUnbekannt") : meta.sourceVersion}
          </span>
          <span data-numeric>{t("status.knoten", { count: nodeCount(model) })}</span>
          {meta.attachments.length > 0 ? (
            <span data-numeric>{t("status.anhaenge", { count: meta.attachments.length })}</span>
          ) : null}
          {!anhaengeBereit ? <span>{t("status.anhaengeLaden")}</span> : null}
        </>
      ) : (
        <span>{t("status.keineDatei")}</span>
      )}

      <span className="ml-auto flex items-center gap-3">
        {view === "graph" && model ? (
          <span data-numeric>{t("status.zoom", { prozent: Math.round(graphZoom * 100) })}</span>
        ) : null}

        <button
          type="button"
          data-issues-toggle
          disabled={!model}
          aria-pressed={issuePanelOpen}
          onClick={() => setIssuePanelOpen(!issuePanelOpen)}
          className="flex items-center gap-2 rounded-xs px-1 hover:bg-accent disabled:hover:bg-transparent"
        >
          {constraints > 0 ? (
            <>
              <span aria-hidden className="size-[7px] rounded-full bg-warning" />
              <span className="font-semibold text-warning-text" data-numeric>
                {t("status.constraints", { count: constraints })}
              </span>
            </>
          ) : null}
          {warnungen > 0 ? (
            <span data-numeric>{t("status.warnungen", { count: warnungen })}</span>
          ) : null}
          {model && issues.length === 0 ? <span>{t("status.keineBefunde")}</span> : null}
        </button>
      </span>
    </footer>
  );
}
