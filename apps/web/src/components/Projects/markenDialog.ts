/**
 * Die gemeinsame Erscheinung der Dialoge des Einstiegs.
 *
 * Warum nicht `ui/dialog.tsx`: dessen Varianten setzen Hoehe, Radius und Farben des
 * Editors. Der Einstieg ist wie die Anmeldung eine Markenflaeche, und Komponentenfarben zu
 * ueberschreiben verstiesse gegen die Regel im Kopf von `tokens.css`.
 *
 * **Wichtig:** Radix haengt seinen Inhalt an `document.body`, also ausserhalb von
 * `.szene-axon`. Overlay und Inhalt tragen die Klasse deshalb selbst, sonst sind alle
 * `--axon-*` unaufgeloest und der Dialog erscheint farblos.
 */

export const UEBERLAGERUNG =
  "szene-axon fixed inset-0 z-50 bg-axon-grund/45 backdrop-blur-xs " +
  "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0";

export const INHALT =
  "szene-axon fixed top-1/2 left-1/2 z-50 flex w-full max-w-(--w-anmeldekarte) -translate-x-1/2 " +
  "-translate-y-1/2 flex-col gap-5 border border-axon-karte-rand bg-axon-karte px-7 py-6.5 " +
  "backdrop-blur-(--blur-glas) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 " +
  "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

export const TITEL = "font-display text-xl font-light tracking-tight text-axon-schrift";

export const TEXT = "text-sm text-axon-schrift-leise";

export const ETIKETT =
  "font-mono text-3xs tracking-(--tracking-etikett) text-axon-schrift-still uppercase";

export const FELD =
  "h-(--h-anmeldefeld) border-b border-axon-feld-rand bg-transparent text-md text-axon-schrift " +
  "outline-none transition-colors duration-(--duration-calm) placeholder:text-axon-platzhalter " +
  "focus:border-axon-fokus";

/** Der bestaetigende Knopf. Gruen wie die Anmeldung, rot nur beim Loeschen. */
export function aktionsKnopf(art: "normal" | "zerstoerend" = "normal"): string {
  const grund =
    art === "zerstoerend"
      ? "border-axon-fehler-kraeftig hover:bg-axon-fehler-kraeftig"
      : "border-axon-aktion hover:border-axon-aktion-hover hover:bg-axon-aktion";
  return (
    "flex h-(--h-einstiegsfeld) items-center gap-2 border px-5 text-2xs tracking-(--tracking-aktion) " +
    "text-axon-schrift uppercase transition-colors duration-(--duration-calm) " +
    "disabled:pointer-events-none disabled:opacity-40 " +
    grund
  );
}

export const ABBRECHEN =
  "flex h-(--h-einstiegsfeld) items-center px-5 text-2xs tracking-(--tracking-aktion) " +
  "text-axon-schrift-still uppercase transition-colors duration-(--duration-calm) " +
  "hover:text-axon-schrift disabled:pointer-events-none disabled:opacity-40";
