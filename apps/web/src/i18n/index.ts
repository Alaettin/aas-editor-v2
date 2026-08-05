import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { gespeicherteAnsicht } from "@/store/ansicht";
import de from "./de.json";
import en from "./en.json";

/**
 * Oberflaechensprache, Plan Abschnitt 8.
 *
 * Zwei Sprachen, Deutsch und Englisch, gleichberechtigt. Welche gilt, entscheidet der
 * abgelegte Wert; ohne ihn die Sprache des Browsers. Umgeschaltet wird ueber
 * `useAnsicht.setLanguage`, angewandt in `App.tsx`.
 *
 * AAS-Fachbegriffe (Submodel, SubmodelElementCollection, semanticId, Qualifier) bleiben in
 * **beiden** Sprachen unuebersetzt: sie sind in der Spezifikation Eigennamen, und wer sie
 * eindeutscht, macht das Ergebnis unauffindbar.
 *
 * Beide Buendel liegen fest im Startbundle. Zusammen sind sie wenige KB gzip, und ein
 * Nachladen brauchte einen Ladezustand fuer jede Beschriftung im Bild.
 */

void i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng: gespeicherteAnsicht().language,
  // Faellt ein Schluessel in der englischen Fassung aus, erscheint der deutsche Satz.
  // `i18n.test.ts` haelt beide Dateien deckungsgleich, das hier ist das Netz darunter.
  fallbackLng: "de",
  interpolation: { escapeValue: false },
});

export default i18n;
