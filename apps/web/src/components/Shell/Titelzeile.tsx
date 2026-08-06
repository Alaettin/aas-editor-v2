import { useTranslation } from "react-i18next";

import logo from "@/assets/neoception-weiss.png";

/**
 * Die oberste Zeile: nur die Marke.
 *
 * Sie ersetzt seit dem 06.08.2026 die Menuezeile. Projektname und Speicherzustand standen
 * bis zuletzt rechts daneben; beides ist in die Fusszeile gewandert, wo die uebrigen
 * Angaben zum geoeffneten Stand ohnehin schon stehen.
 */
export function Titelzeile() {
  const { t } = useTranslation();

  return (
    <div className="flex h-(--h-titelzeile) shrink-0 items-center gap-3 border-b border-border-subtle bg-muted px-4">
      <img src={logo} alt={t("anmeldung.marke")} className="w-(--w-titellogo)" />
      <span className="font-mono text-3xs tracking-(--tracking-etikett) text-muted-foreground uppercase">
        {t("app.titel")}
      </span>
    </div>
  );
}
