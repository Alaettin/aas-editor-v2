import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/store/editor";

/**
 * Filterfeld ueber dem Baum.
 *
 * Zum Stoebern und Eingrenzen. Fuer das gezielte Springen gibt es die Kommando-Palette
 * unter Strg+K. Treffer bleiben mit ihrer
 * Elternkette sichtbar, siehe `buildRows`.
 */
export function TreeFilter({ visibleCount }: { readonly visibleCount: number }) {
  const { t } = useTranslation();
  const filter = useEditor((state) => state.filter);
  const setFilter = useEditor((state) => state.setFilter);

  return (
    <div className="shrink-0 px-2.5 pb-2">
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5">
        <Search className="size-3 shrink-0 text-foreground-faint" />
        <Input
          variant="bare"
          data-tree-filter
          value={filter}
          placeholder={t("baum.filter")}
          aria-label={t("baum.filter")}
          onChange={(event) => setFilter(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setFilter("");
          }}
        />
        {filter ? (
          <>
            {/*
              Die Trefferzahl aendert sich waehrend des Tippens. Ohne lebenden Bereich
              bleibt sie fuer einen Bildschirmleser stumm, und der Filter ist dort
              wirkungslos.
            */}
            <span
              aria-live="polite"
              className="shrink-0 text-2xs text-foreground-faint"
              data-numeric
            >
              {t("baum.treffer", { count: visibleCount })}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              aria-label={t("baum.filterLeeren")}
              onClick={() => setFilter("")}
            >
              <X />
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
