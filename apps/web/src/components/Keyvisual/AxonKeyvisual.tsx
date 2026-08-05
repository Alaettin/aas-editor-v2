import { useEffect, useMemo, useRef, type RefObject } from "react";

import { readCssVars } from "@/lib/readCssVars";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { baueHalo, neuerLauf, PALETTEN_NAMEN, zeichneBild, type Palette } from "./draw";
import { ansichtFuer, baueSchienen, baueStroeme, STANDBILD_ZEIT } from "./geometry";

/**
 * Das AXON-Keyvisual als Animation.
 *
 * Der Canvas fuellt seinen Umschlag und traegt keine Information: er ist `aria-hidden`.
 * Die Farben kommen aus den Tokens von `.szene-axon`, gelesen am Canvas selbst, damit der
 * Geltungsbereich greift.
 *
 * Bei `prefers-reduced-motion` laeuft **keine** Schleife: es wird genau ein Bild gezeichnet.
 * Der Block in `tokens.css` daempft nur CSS-Dauern, eine Animationsschleife nicht.
 */

/**
 * Ganggeschwindigkeit der Buehne.
 *
 * Der Entwurf lief mit 1 und wirkte im fertigen Bild hektisch: die Datenpakete schossen
 * durch, statt zu wandern. Die Anmeldung soll ruhig sein, man haelt sich dort keine
 * Minute auf. Der Faktor sitzt an genau einer Stelle, am `dt` der Schleife, und traegt
 * damit alles mit: Punkte, Wolken, Ringe und die Welle der Schienen. Die Animationen der
 * Karte selbst haengen an CSS und bleiben unberuehrt.
 */
const TEMPO = 0.55;

interface Props {
  readonly tempo?: number;
  readonly spurenzahl?: number;
  /**
   * Die Anmeldekarte. Erreicht ein Datenpaket das Ende einer Schiene, schreibt das
   * Keyvisual dort `--axon-blitz`. Bewusst eine CSS-Variable und kein Zustand: sonst
   * renderte React im Takt der Animation.
   */
  readonly kartenRef?: RefObject<HTMLElement | null>;
}

export function AxonKeyvisual({ tempo = TEMPO, spurenzahl = 15, kartenRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stroeme = useMemo(() => baueStroeme(spurenzahl), [spurenzahl]);
  const schienen = useMemo(() => baueSchienen(), []);
  const ruhig = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // Ohne 2D-Kontext bleibt die Flaeche einfach flach blau. Kein Fehler auf der
    // Anmeldeseite, die Browserabnahme verbietet jede Konsolenausgabe.
    if (!ctx) return;

    const palette = readCssVars(canvas, PALETTEN_NAMEN) as Palette;
    const halo = baueHalo(palette);

    /*
     * Der gesamte Laufzustand liegt in dieser Closure, nicht in Refs. Refs ueberleben den
     * doppelten Mount von StrictMode und wuerden einen halb gelaufenen Zustand fortsetzen.
     */
    let aktiv = true;
    let bildId = 0;
    let breite = 0;
    let hoehe = 0;
    let dpr = 1;
    let zeit = ruhig ? STANDBILD_ZEIT : 0;
    let letzteZeit = 0;
    let letzterBlitz = -1;
    const lauf = neuerLauf();

    const zeichne = (dt: number) => {
      zeichneBild({
        ctx,
        breite,
        hoehe,
        dpr,
        ansicht: ansichtFuer(breite, hoehe),
        stroeme,
        schienen,
        palette,
        halo,
        zeit,
        dt,
        lauf,
        bewegt: !ruhig,
      });
    };

    /** Den Blitz an die Karte melden, aber nur wenn sich der Wert merklich aendert. */
    const meldeBlitz = (dt: number) => {
      const karte = kartenRef?.current;
      if (!karte) return;
      lauf.blitz = Math.max(0, lauf.blitz - dt * 1.6);
      const wert = Math.round(lauf.blitz * 100) / 100;
      if (wert === letzterBlitz) return;
      letzterBlitz = wert;
      karte.style.setProperty("--axon-blitz", String(wert));
    };

    const messen = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      breite = canvas.clientWidth;
      hoehe = canvas.clientHeight;

      const pufferBreite = Math.round(breite * dpr);
      const pufferHoehe = Math.round(hoehe * dpr);
      if (canvas.width !== pufferBreite) canvas.width = pufferBreite;
      if (canvas.height !== pufferHoehe) canvas.height = pufferHoehe;

      // Im Ruhemodus laeuft keine Schleife, und das Setzen von width leert den Puffer:
      // das Standbild muss hier neu gezeichnet werden.
      if (ruhig) zeichne(0);
    };

    const takt = (jetzt: number) => {
      if (!aktiv) return;
      const dt = Math.min(0.05, (jetzt - (letzteZeit || jetzt)) / 1000) * tempo;
      letzteZeit = jetzt;
      // Inkrementell statt jetzt-minus-Start: sonst springen nach einem Hintergrundtab
      // alle Phasen auf einmal weiter.
      zeit += dt;
      zeichne(dt);
      meldeBlitz(dt);
      // Nachforderung am Ende, nicht am Anfang: sonst liefe das Aufraeumen ins Leere.
      bildId = requestAnimationFrame(takt);
    };

    const beobachter = new ResizeObserver(messen);
    beobachter.observe(canvas);
    // Ein reiner Wechsel der Geraetepixel (Zoom, anderer Bildschirm) aendert die
    // CSS-Groesse nicht und erreicht den Beobachter deshalb nicht.
    window.addEventListener("resize", messen);
    messen();

    if (!ruhig) bildId = requestAnimationFrame(takt);

    return () => {
      aktiv = false;
      cancelAnimationFrame(bildId);
      beobachter.disconnect();
      window.removeEventListener("resize", messen);
      kartenRef?.current?.style.removeProperty("--axon-blitz");
    };
  }, [stroeme, schienen, tempo, ruhig, kartenRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 block size-full select-none"
    />
  );
}
