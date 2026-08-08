import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";

import { Marke } from "@/components/Shell/Marke";
import { Sprachknopf } from "@/components/Shell/Sprachknopf";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/store/auth";

/**
 * Die oberste Zeile: links die Marke, rechts Sprache, Einstellungen, Konto.
 *
 * Sie ersetzt seit dem 06.08.2026 die Menuezeile. Projektname und Speicherzustand standen
 * bis zuletzt rechts daneben; beides ist in die Fusszeile gewandert, wo die uebrigen
 * Angaben zum geoeffneten Stand ohnehin schon stehen.
 *
 * Seit dem 08.08.2026 tragen Einstieg **und** Editor dieselbe Zeile, mit derselben Marke
 * und denselben drei Knoepfen. Vorher hatte der Einstieg eine eigene linke Leiste mit
 * Sprachwahl, Einstellungen und Konto, und der Editor die Einstellungen in der
 * Werkzeugleiste.
 */
export function Titelzeile({ onEinstellungen }: { readonly onEinstellungen: () => void }) {
  const { t } = useTranslation();
  const benutzer = useAuth((state) => state.benutzer);
  const abmelden = useAuth((state) => state.abmelden);

  const kuerzel = (benutzer?.name ?? "").slice(0, 2).toUpperCase();

  return (
    <header className="flex h-(--h-titelzeile) shrink-0 items-center gap-1.5 border-b border-border-subtle bg-muted px-4">
      <Marke />

      <div className="ml-auto flex items-center gap-1.5">
        <Sprachknopf />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-toolbar"
              aria-label={t("werkzeug.einstellungen")}
              onClick={onEinstellungen}
            >
              <SlidersHorizontal />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("werkzeug.einstellungen")}</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={benutzer?.name ?? t("projekte.konto")}
              className="rounded-full border border-border font-mono text-2xs"
            >
              {kuerzel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Der Name steht als Zeile, nicht als Beschriftung des Kreises: zwei Zeichen
                sagen nicht, wer angemeldet ist. */}
            <DropdownMenuItem disabled className="opacity-100">
              {benutzer?.name}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void abmelden()}>
              {t("anmeldung.abmelden")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
