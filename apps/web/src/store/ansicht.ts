import { create } from "zustand";

/**
 * Dichte und Sprache, getrennt vom Editor.
 *
 * Bis Phase 9 lagen sie in `store/editor.ts`, und nur `AppShell` schrieb sie an das
 * Wurzelelement. Wer direkt auf `/projekte` einstieg, bekam sie deshalb nie zu sehen: die
 * Liste importiert bewusst nichts aus dem Editor-Speicher, damit der Editor nicht im
 * Startbundle landet.
 *
 * **Die Erscheinung stand bis zum 06.08.2026 hier mit drin.** Seit die Anwendung
 * durchgaengig auf der AXON-Flaeche steht, gibt es nur noch eine, und damit nichts mehr
 * umzuschalten.
 *
 * Dieser Speicher ist winzig, haengt an **nichts** und darf deshalb ueberall gelesen
 * werden, auch von `i18n/index.ts`. Umgekehrt importiert er i18next bewusst nicht: das
 * waere ein Kreis, denn i18next braucht beim Start die abgelegte Sprache. Den Sprachwechsel
 * loest deshalb das Wurzelbauteil aus, siehe `App.tsx`.
 *
 * Geschrieben wird zusaetzlich in den lokalen Speicher, und `index.html` liest ihn vor
 * dem ersten Bild. Ohne das springt die Dichte bei jedem Laden kurz, und die Seite traege
 * einen Wimpernschlag lang die falsche Sprachauszeichnung.
 */

export type Density = "compact" | "cozy";
export type Language = "de" | "en";

/** Der Schluessel steht auch im Vorabskript in index.html. Aendert er sich, dort mit. */
export const ANSICHT_SCHLUESSEL = "aas-editor-ansicht";

export interface Ansicht {
  density: Density;
  language: Language;
}

interface AnsichtState extends Ansicht {
  setDensity: (density: Density) => void;
  setLanguage: (language: Language) => void;
}

function gelesen(): Ansicht {
  // Ohne Einstellung gilt, was das System sagt. Erst eine bewusste Wahl legt sich
  // darueber, und die ueberdauert das Neuladen.
  const spracheVorgabe: Language =
    typeof navigator === "object" && navigator.language.toLowerCase().startsWith("en")
      ? "en"
      : "de";
  const vorgabe: Ansicht = {
    density: "cozy",
    language: spracheVorgabe,
  };

  try {
    const roh = localStorage.getItem(ANSICHT_SCHLUESSEL);
    if (!roh) return vorgabe;
    const wert = JSON.parse(roh) as Partial<Ansicht>;
    return {
      density: wert.density === "compact" ? "compact" : "cozy",
      // Nur ein abgelegter Wert ueberschreibt die Systemsprache. Ein leeres oder
      // unbekanntes Feld heisst "nie gewaehlt", nicht "Deutsch".
      language: wert.language === "de" || wert.language === "en" ? wert.language : vorgabe.language,
    };
  } catch {
    // Ein gesperrter oder kaputter Speicher darf die Anwendung nicht aufhalten.
    return vorgabe;
  }
}

function abgelegt(ansicht: Ansicht): void {
  try {
    localStorage.setItem(
      ANSICHT_SCHLUESSEL,
      JSON.stringify({
        density: ansicht.density,
        language: ansicht.language,
      }),
    );
  } catch {
    // siehe oben
  }
}

export const useAnsicht = create<AnsichtState>()((set, get) => ({
  ...gelesen(),
  setDensity: (density) => {
    set({ density });
    abgelegt({ ...get(), density });
  },
  setLanguage: (language) => {
    set({ language });
    abgelegt({ ...get(), language });
  },
}));

/**
 * Schreibt Dichte und Sprache an das Wurzelelement.
 * Genau eine Stelle, und sie haengt ueber dem Router.
 *
 * `documentElement.lang` ist nicht Zierrat: davon haengt ab, wie ein Bildschirmleser die
 * Seite ausspricht und welche Trennregeln der Browser anwendet.
 */
export function anwenden({ density, language }: Ansicht): void {
  document.documentElement.dataset["density"] = density;
  document.documentElement.lang = language;
}

/** Die abgelegte Ansicht, ohne den Speicher zu abonnieren. Fuer i18n beim Start. */
export function gespeicherteAnsicht(): Ansicht {
  return gelesen();
}

/**
 * Zugang fuer die Browser-Abnahme, wie beim Editor-Speicher. Nur im Entwicklungsbetrieb.
 *
 * Die Pruefung auf `window` ist noetig, seit `i18n/index.ts` diesen Speicher liest: damit
 * laeuft er auch im Node-Lauf der Tests, und dort gibt es kein Fenster.
 */
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)["__aasAnsichtStore"] = useAnsicht;
}
