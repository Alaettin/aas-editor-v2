import { useTranslation } from "react-i18next";
import { MessageSquare, SendHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { SectionLabel } from "@/components/ui/section-label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssistant } from "@/store/assistant";
import { useEditor } from "@/store/editor";
import { labelOf } from "@/store/rows";
import { AssistantDiff } from "./AssistantDiff";
import { BEISPIEL_DIFF } from "./demo";

/**
 * Der Assistent, **als Huelle**. Es ist kein Modell angebunden.
 *
 * Sechs Regeln halten das ehrlich, sie sind nicht verhandelbar:
 *
 * 1. Der Chip "Nicht verbunden" steht dauerhaft im Kopf, nie in Gruen, nicht wegklickbar.
 * 2. Der Verlauf ist als BEISPIEL beschriftet, direkt darueber.
 * 3. Das Eingabefeld ist deaktiviert, ebenso die Vorschlagschips.
 * 4. **Zur Laufzeit wird keine einzige Antwort erzeugt.** Kein Tipp-Timer, keine Konserve,
 *    die auf Eingaben reagiert. Statischer, beschrifteter Beispielinhalt ist zulaessig,
 *    alles was auf Eingaben antwortet, waere eine Faelschung.
 * 5. "Anwenden" und "Im Formular pruefen" sind deaktiviert und sagen im Tooltip warum.
 * 6. `AssistantDiff` ist eine echte Komponente mit typisiertem Prop. Beim Anbinden faellt
 *    nur `demo.ts` weg.
 */
export function AssistantPanel() {
  const { t } = useTranslation();
  const schliessen = useAssistant((state) => state.umschalten);
  const model = useEditor((state) => state.model);
  const selection = useEditor((state) => state.selection);

  const knoten = model && selection ? model.nodes[selection] : undefined;
  const kontext = knoten ? labelOf(knoten) : t("assistent.ohneKontext");

  return (
    <aside
      data-assistant
      className="flex w-90 shrink-0 flex-col border-l border-border bg-muted"
      aria-label={t("assistent.titel")}
    >
      <header className="flex h-(--h-chat-header) shrink-0 items-center gap-2 border-b border-border-subtle px-3.5">
        <MessageSquare className="size-3.5 text-muted-foreground" />
        <span className="text-base font-semibold text-foreground">{t("assistent.titel")}</span>
        <Chip tone="warn" data-assistant-status>
          {t("assistent.nichtVerbunden")}
        </Chip>
        <span className="ml-auto truncate text-2xs text-foreground-faint">
          {t("assistent.kontext", { name: kontext })}
        </span>
        <Button variant="ghost" size="icon-xs" aria-label={t("versionen.schliessen")} onClick={schliessen}>
          <X />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto p-3.5">
        <div className="flex flex-col gap-1">
          <SectionLabel>{t("assistent.beispiel")}</SectionLabel>
          <p className="text-2xs text-foreground-faint">{t("assistent.beispielText")}</p>
        </div>

        <div className="max-w-[85%] self-end rounded-5xl rounded-br-xs bg-primary px-3 py-2 text-sm text-primary-foreground">
          {t("assistent.beispielFrage")}
        </div>

        <div className="max-w-[96%] self-start rounded-5xl rounded-bl-xs border border-border bg-card px-3 py-2.5 text-sm text-secondary-foreground">
          {t("assistent.beispielAntwort")}
          <AssistantDiff changes={BEISPIEL_DIFF} />

          <div className="mt-2.5 flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="sm" disabled>
                    {t("assistent.anwenden")}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("assistent.ohneAnbindung")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="sm" variant="outline" disabled>
                    {t("assistent.imFormular")}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("assistent.ohneAnbindung")}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <p className="text-2xs text-foreground-faint">{t("assistent.disclaimer")}</p>
      </div>

      <div className="shrink-0 p-3.5 pt-2.5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {["assistent.chipBefunde", "assistent.chipVorlage", "assistent.chipUebersetzung"].map(
            (schluessel) => (
              <Chip key={schluessel} tone="aas" size="sm" pill className="opacity-50">
                {t(schluessel)}
              </Chip>
            ),
          )}
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 opacity-60">
          <input
            disabled
            aria-label={t("assistent.titel")}
            placeholder={t("assistent.platzhalter")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground-faint"
          />
          <SendHorizontal className="size-3.5 shrink-0 text-foreground-faint" />
        </div>
      </div>
    </aside>
  );
}
