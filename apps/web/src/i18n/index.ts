import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import de from "./de.json";

/**
 * Oberflaechensprache, Plan Abschnitt 8.
 *
 * Standardsprache ist Deutsch. AAS-Fachbegriffe (Submodel, SubmodelElementCollection,
 * semanticId, Qualifier) bleiben **unuebersetzt**, sie sind in der Spezifikation
 * Eigennamen. Englisch ist dadurch spaeter eine reine Uebersetzungsdatei.
 */

void i18n.use(initReactI18next).init({
  resources: { de: { translation: de } },
  lng: "de",
  fallbackLng: "de",
  interpolation: { escapeValue: false },
});

export default i18n;
