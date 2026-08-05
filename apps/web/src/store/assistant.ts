import { create } from "zustand";

/**
 * Sichtbarkeit des Assistenzpanels.
 *
 * Eigener Store, damit die Werkzeugleiste ihn lesen kann, ohne den Editor-Store zu
 * beruehren, und damit das Panel selbst nachgeladen werden kann.
 *
 * **Der Assistent ist in dieser Phase nur eine Huelle.** Es gibt keine Anbindung, und es
 * darf hier auch keine Antwortlogik entstehen: siehe die Regeln in AssistantPanel.tsx.
 */

interface AssistantState {
  offen: boolean;
  umschalten: () => void;
  setzen: (offen: boolean) => void;
}

export const useAssistant = create<AssistantState>()((set, get) => ({
  offen: false,
  umschalten: () => set({ offen: !get().offen }),
  setzen: (offen) => set({ offen }),
}));
