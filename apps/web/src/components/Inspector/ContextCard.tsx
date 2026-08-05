import { useTranslation } from "react-i18next";
import { childSlotsOf, type EditorModel, type EditorNode } from "@aas-editor/core";

import { SectionLabel } from "@/components/ui/section-label";
import { useEditor } from "@/store/editor";
import { labelOf } from "@/store/rows";

/**
 * Wo steht dieses Element? Elternteil, Position und der Speicherstand des Projekts.
 *
 * Bewusst **kein** "zuletzt geaendert" je Element: dafuer gibt es kein Datenmodell, der
 * Server fuehrt Zeitstempel nur je Projekt. Ein erfundener Wert waere schlimmer als keiner.
 */
export function ContextCard({
  model,
  node,
}: {
  readonly model: EditorModel;
  readonly node: EditorNode;
}) {
  const { t } = useTranslation();
  const projektName = useEditor((state) => state.projektName);
  const serverStatus = useEditor((state) => state.serverStatus);

  const eltern = node.parent ? model.nodes[node.parent] : undefined;
  const position = (() => {
    if (!eltern || !node.slot) return null;
    const geschwister = eltern.children[node.slot] ?? [];
    const index = geschwister.indexOf(node.nodeId);
    return index >= 0 ? { index: index + 1, gesamt: geschwister.length } : null;
  })();

  const slots = childSlotsOf(node.kind);
  const kinder = slots.reduce((summe, slot) => summe + (node.children[slot.name]?.length ?? 0), 0);

  return (
    <div className="rounded-4xl border border-border bg-card p-4">
      <SectionLabel className="mb-2.5 block">{t("formular.kontext")}</SectionLabel>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {eltern ? (
          <>
            <dt className="text-muted-foreground">{t("formular.teilVon")}</dt>
            <dd className="truncate">
              {labelOf(eltern)} <span className="text-muted-foreground">({eltern.kind})</span>
            </dd>
          </>
        ) : null}
        {position ? (
          <>
            <dt className="text-muted-foreground">{t("formular.position")}</dt>
            <dd data-numeric>
              {position.index} / {position.gesamt}
            </dd>
          </>
        ) : null}
        {kinder > 0 ? (
          <>
            <dt className="text-muted-foreground">{t("formular.kinder")}</dt>
            <dd data-numeric>{kinder}</dd>
          </>
        ) : null}
        {projektName ? (
          <>
            <dt className="text-muted-foreground">{t("formular.projekt")}</dt>
            <dd className="truncate">
              {projektName}
              <span className="ml-1 text-muted-foreground">
                {serverStatus === "gespeichert" ? t("status.gespeichert") : t("status.ungespeichert")}
              </span>
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
