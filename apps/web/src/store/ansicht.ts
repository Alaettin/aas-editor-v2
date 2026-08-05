import { create } from "zustand";

/**
 * Erscheinung und Dichte, getrennt vom Editor.
 *
 * Bis Phase 9 lagen beide in `store/editor.ts`, und nur `AppShell` schrieb sie an das
 * Wurzelelement. Wer direkt auf `/projekte` einstieg, sah die Liste deshalb **immer
 * hell**, egal was eingestellt war: die Liste importiert bewusst nichts aus dem
 * Editor-Speicher, damit der Editor nicht im Startbundle landet.
 *
 * Dieser Speicher ist winzig, hat keine Abhaengigkeiten und darf deshalb ueberall
 * gelesen werden. Der Abgleich mit `<html>` haengt jetzt im Wurzelbauteil, nicht mehr
 * im Editor-Rahmen.
 *
 * Geschrieben wird zusaetzlich in den lokalen Speicher, und `index.html` liest ihn vor
 * dem ersten Bild. Ohne das blitzt bei jedem Laden kurz die helle Fassung auf.
 */

export type Density = "compact" | "cozy";
export type Theme = "light" | "dark";

/** Der Schluessel steht auch im Vorabskript in index.html. Aendert er sich, dort mit. */
export const ANSICHT_SCHLUESSEL = "aas-editor-ansicht";

interface AnsichtState {
  theme: Theme;
  density: Density;
  setTheme: (theme: Theme) => void;
  setDensity: (density: Density) => void;
}

function gelesen(): { theme: Theme; density: Density } {
  // Ohne Einstellung gilt, was das Betriebssystem sagt. Erst eine bewusste Wahl legt
  // sich darueber, und die ueberdauert das Neuladen.
  const dunkelVorgabe =
    typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  const vorgabe = {
    theme: (dunkelVorgabe ? "dark" : "light") as Theme,
    density: "cozy" as Density,
  };
  try {
    const roh = localStorage.getItem(ANSICHT_SCHLUESSEL);
    if (!roh) return vorgabe;
    const wert = JSON.parse(roh) as Partial<{ theme: Theme; density: Density }>;
    return {
      theme: wert.theme === "dark" ? "dark" : "light",
      density: wert.density === "compact" ? "compact" : "cozy",
    };
  } catch {
    // Ein gesperrter oder kaputter Speicher darf die Anwendung nicht aufhalten.
    return vorgabe;
  }
}

function abgelegt(theme: Theme, density: Density): void {
  try {
    localStorage.setItem(ANSICHT_SCHLUESSEL, JSON.stringify({ theme, density }));
  } catch {
    // siehe oben
  }
}

export const useAnsicht = create<AnsichtState>()((set, get) => ({
  ...gelesen(),
  setTheme: (theme) => {
    set({ theme });
    abgelegt(theme, get().density);
  },
  setDensity: (density) => {
    set({ density });
    abgelegt(get().theme, density);
  },
}));

/**
 * Schreibt Erscheinung und Dichte an das Wurzelelement, damit die Tokens greifen.
 * Genau eine Stelle, und sie haengt ueber dem Router.
 */
export function anwenden(theme: Theme, density: Density): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset["density"] = density;
}

/**
 * Zugang fuer die Browser-Abnahme, wie beim Editor-Speicher. Nur im Entwicklungsbetrieb.
 */
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>)["__aasAnsichtStore"] = useAnsicht;
}
