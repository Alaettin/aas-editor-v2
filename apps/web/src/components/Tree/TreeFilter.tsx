import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/store/editor";

/**
 * Filterfeld ueber dem Baum.
 *
 * Zum Stoebern und Eingrenzen. Fuer das gezielte Springen gibt es die Kommando-Palette
 * (Strg+K). Treffer bleiben mit ihrer Elternkette sichtbar, siehe `buildRows`.
 */
export function TreeFilter({ visibleCount }: { readonly visibleCount: number }) {
  const { t } = useTranslation();
  const filter = useEditor((state) => state.filter);
  const setFilter = useEditor((state) => state.setFilter);

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <Input
        data-tree-filter
        value={filter}
        placeholder={t("baum.filter")}
        aria-label={t("baum.filter")}
        onChange={(event) => setFilter(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setFilter("");
        }}
        className="h-6 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
      />
      {filter ? (
        <>
          <span className="shrink-0 text-2xs text-muted-foreground" data-numeric>
            {t("baum.treffer", { count: visibleCount })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-5 shrink-0"
            aria-label={t("baum.filterLeeren")}
            onClick={() => setFilter("")}
          >
            <X />
          </Button>
        </>
      ) : null}
    </div>
  );
}
