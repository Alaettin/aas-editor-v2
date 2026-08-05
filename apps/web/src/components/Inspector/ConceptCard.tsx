import { useTranslation } from "react-i18next";
import { describeSemanticId, type EditorModel, type EditorNode } from "@aas-editor/core";

import { Chip } from "@/components/ui/chip";
import { useEditor } from "@/store/editor";
import { labelOf, shortenMiddle } from "@/store/rows";

/**
 * Die ConceptDescription zum gewaehlten Element, dort wo der Wert bearbeitet wird.
 *
 * Alle Angaben stammen aus `describeSemanticId` im Kern. Was dort fehlt, wird nicht
 * geraten, sondern weggelassen: eine ausgedachte Definition waere schlimmer als keine.
 */
export function ConceptCard({
  model,
  node,
}: {
  readonly model: EditorModel;
  readonly node: EditorNode;
}) {
  const { t } = useTranslation();
  const goToNode = useEditor((state) => state.goToNode);

  const semanticId = node.data["semanticId"];
  if (semanticId === undefined) return null;

  const info = describeSemanticId(model, semanticId);

  if (!info) {
    return (
      <div className="rounded-4xl border border-dashed border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">{t("formular.keineDefinition")}</p>
      </div>
    );
  }

  const kennung = typeof info.conceptDescription.data["id"] === "string"
    ? (info.conceptDescription.data["id"] as string)
    : null;

  return (
    <div className="rounded-4xl border border-type-cd-border bg-type-cd-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Chip tone="cd" mono>
          CD
        </Chip>
        <span className="truncate text-base font-semibold">
          {info.preferredName ?? labelOf(info.conceptDescription)}
        </span>
        <button
          type="button"
          className="ml-auto shrink-0 text-xs font-medium text-type-cd-text hover:underline"
          onClick={() => goToNode(info.conceptDescription.nodeId)}
        >
          {t("formular.zurDefinition")}
        </button>
      </div>

      {info.definition ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{info.definition}</p>
      ) : null}

      {info.dataType || info.unit || kennung ? (
        <p className="mt-2 truncate font-mono text-2xs text-foreground-faint" title={kennung ?? ""}>
          {[info.dataType, info.unit, kennung ? shortenMiddle(kennung, 40) : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
