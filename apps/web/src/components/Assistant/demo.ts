/**
 * Beispielinhalt fuer die Assistenten-Huelle.
 *
 * **Das ist Anschauungsmaterial, keine Antwort.** Es wird einmal gerendert und reagiert auf
 * nichts. Sobald der Assistent angebunden wird, faellt genau diese Datei weg und
 * `AssistantDiff` bekommt echte Patches.
 */

export interface DiffZeile {
  readonly art: "entfernt" | "hinzugefuegt";
  readonly text: string;
}

export interface DiffEintrag {
  readonly element: string;
  readonly kind: string;
  readonly zeilen: readonly DiffZeile[];
}

export const BEISPIEL_DIFF: readonly DiffEintrag[] = [
  {
    element: "CompanyLogo",
    kind: "File",
    zeilen: [
      { art: "entfernt", text: "contentType: —" },
      { art: "hinzugefuegt", text: "contentType: image/png" },
    ],
  },
  {
    element: "ManufacturerProductRoot",
    kind: "MultiLanguageProperty",
    zeilen: [
      { art: "entfernt", text: 'de: ""' },
      { art: "hinzugefuegt", text: 'de: "Durchflussmesser"' },
    ],
  },
];
