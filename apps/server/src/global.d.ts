/**
 * Die Fassung aus `apps/server/package.json`. esbuild setzt sie beim Buendeln ein
 * (`build.mjs`), tsx im Entwicklungsbetrieb ueber `globalThis`, siehe `index.ts`.
 * Abschreiben waere eine zweite Wahrheit: genau daran ist der Health-Endpunkt bis zum
 * 06.08.2026 auf 0.1.0 stehengeblieben.
 */
declare const __APP_VERSION__: string;
